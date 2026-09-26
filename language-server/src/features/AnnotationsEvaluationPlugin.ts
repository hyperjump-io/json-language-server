import { getKeyword } from "@hyperjump/json-schema/experimental";
import * as JsonPointer from "@hyperjump/json-pointer";

import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node, Keyword } from "@hyperjump/json-schema/experimental";

type Annotation = Record<string, unknown>;

type MatchingSchemaContext = ValidationContext & {
  pendingAnnotations?: Annotation;
  dynamicAnchors?: Record<string, string>;
};

export class AnnotationsEvaluationPlugin implements EvaluationPlugin {
  static readonly id = "annotations";

  private annotations: Map<string, Annotation[]> = new Map();
  private incompleteLocations: Set<string>;

  constructor(incompleteLocations: Set<string> = new Set()) {
    this.incompleteLocations = incompleteLocations;
  }

  beforeSchema(_url: string, _instance: JsonNode, context: MatchingSchemaContext): void {
    context.pendingAnnotations = {};
  }

  beforeKeyword(keywordNode: Node<unknown>, instance: JsonNode, _context: MatchingSchemaContext, schemaContext: MatchingSchemaContext): void {
    const [keywordId, , keywordValue] = keywordNode;

    switch (keywordId) {
      case "https://json-schema.org/keyword/properties": {
        const properties = keywordValue as Record<string, string>;
        for (const propertyName in properties) {
          const pointer = JsonPointer.append(propertyName, instance.pointer);
          if (this.incompleteLocations.has(pointer)) {
            this.recordBuiltAnnotation(pointer, properties[propertyName], schemaContext);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/patternProperties": {
        const patternProperties = keywordValue as [RegExp, string][];
        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer !== instance.pointer) {
            continue;
          }

          for (const [pattern, schemaUri] of patternProperties) {
            if (pattern.test(propertyName)) {
              this.recordBuiltAnnotation(pointer, schemaUri, schemaContext);
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/additionalProperties": {
        const [isDeclaredProperty, schemaUri] = keywordValue as [RegExp, string];
        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !isDeclaredProperty.test(propertyName)) {
            this.recordBuiltAnnotation(pointer, schemaUri, schemaContext);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/prefixItems": {
        const prefixItems = keywordValue as string[];
        for (let itemIndex = 0; itemIndex < prefixItems.length; itemIndex++) {
          const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
          if (this.incompleteLocations.has(pointer)) {
            this.recordBuiltAnnotation(pointer, prefixItems[itemIndex], schemaContext);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/draft-04/additionalItems":
      case "https://json-schema.org/keyword/items": {
        const [numberOfPrefixItems, schemaUri] = keywordValue as [number, string];
        for (const pointer of this.incompleteLocations) {
          const [parentPointer, indexStr] = splitPointer(pointer);
          const itemIndex = Number(indexStr);
          if (parentPointer === instance.pointer && itemIndex >= numberOfPrefixItems) {
            this.recordBuiltAnnotation(pointer, schemaUri, schemaContext);
          }
        }
        break;
      }
    }
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: MatchingSchemaContext, _valid: boolean, schemaContext: MatchingSchemaContext, keyword: Keyword<unknown>): void {
    const [keywordId, , keywordValue] = node;

    if (keyword.annotation) {
      schemaContext.pendingAnnotations ??= {};
      schemaContext.pendingAnnotations[keywordId] = keyword.annotation(keywordValue, instance, context);
    }
  }

  afterSchema(_schemaUri: string, instance: JsonNode, context: MatchingSchemaContext, valid: boolean): void {
    if (valid && context.pendingAnnotations) {
      if (!this.annotations.has(instance.pointer)) {
        this.annotations.set(instance.pointer, []);
      }

      const existing = this.annotations.get(instance.pointer)!;
      existing.push(context.pendingAnnotations);
    }
  }

  getAnnotations(instanceLocation: string): Annotation[] {
    return this.annotations.get(instanceLocation) ?? [];
  }

  private buildAnnotations(schemaLocation: string, context: MatchingSchemaContext): Annotation[] {
    const nodes = context.ast[schemaLocation];

    if (nodes === true || nodes === false) {
      return [{}];
    }

    let branches: Annotation[] = [{}];

    for (const node of nodes) {
      const [keywordId, , keywordValue] = node;

      switch (keywordId) {
        case "https://json-schema.org/keyword/ref":
          branches = crossMerge(branches, this.buildAnnotations(keywordValue as string, context));
          break;

        case "https://json-schema.org/keyword/dynamicRef":
          branches = crossMerge(branches, this.buildAnnotations(context.dynamicAnchors![keywordValue as string], context));
          break;

        case "https://json-schema.org/keyword/draft-2020-12/dynamicRef": {
          const [, fragment, ref] = keywordValue as [string, string, string];
          branches = crossMerge(branches, this.buildAnnotations(context.dynamicAnchors![fragment] ?? ref, context));
          break;
        }

        case "https://json-schema.org/keyword/allOf":
          for (const subSchemaLocation of keywordValue as string[]) {
            branches = crossMerge(branches, this.buildAnnotations(subSchemaLocation, context));
          }
          break;

        case "https://json-schema.org/keyword/anyOf":
        case "https://json-schema.org/keyword/oneOf": {
          const alternatives = (keywordValue as string[]).flatMap((sub) => this.buildAnnotations(sub, context));
          branches = crossMerge(branches, alternatives);
          break;
        }

        default: {
          const keyword = getKeyword(keywordId);
          if (keyword?.annotation) {
            try {
              const value = keyword.annotation(keywordValue, undefined as unknown as JsonNode, context);
              branches = branches.map((branch) => ({ ...branch, [keywordId]: value }));
            } catch {
              // Some annotation functions expect a real instance node; skip rather than crash.
            }
          }
        }
      }
    }

    return branches;
  }

  private recordBuiltAnnotation(pointer: string, schemaLocation: string, context: MatchingSchemaContext) {
    const built = this.buildAnnotations(schemaLocation, context);
    const existing = this.annotations.get(pointer) ?? [];
    existing.push(...built);
    this.annotations.set(pointer, existing);
  }
}

function splitPointer(pointer: string): [string, string] {
  const lastSlash = pointer.lastIndexOf("/");
  return [pointer.slice(0, lastSlash), pointer.slice(lastSlash + 1)];
}

function crossMerge(a: Annotation[], b: Annotation[]): Annotation[] {
  const result: Annotation[] = [];
  for (const x of a) {
    for (const y of b) {
      result.push({ ...x, ...y });
    }
  }
  return result;
}
