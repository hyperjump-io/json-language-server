import { getKeyword } from "@hyperjump/json-schema/experimental";
import * as JsonPointer from "@hyperjump/json-pointer";
import { SubschemaTracker } from "./SubschemaTracker.ts";

import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node, Keyword } from "@hyperjump/json-schema/experimental";

type Annotation = Record<string, unknown>;
type Annotations = Record<string, Annotation[]>;

type MatchingSchemaContext = ValidationContext & {
  pendingAnnotations?: Annotation;
  schemaAnnotations?: Annotations;
  dynamicAnchors?: Record<string, string>;
  evaluatedProperties?: Set<string>;
  schemaEvaluatedProperties?: Set<string>;
  evaluatedItems?: Set<number>;
  schemaEvaluatedItems?: Set<number>;
  annotationsUnevaluatedProperties?: string[];
  annotationsUnevaluatedItems?: number[];
};

export class AnnotationsEvaluationPlugin implements EvaluationPlugin {
  static readonly id = "annotations";

  private annotations: Annotations = Object.create(null);
  private incompleteLocations: Set<string>;
  private subschemaTracker = new SubschemaTracker<Annotations>();

  constructor(incompleteLocations: Set<string> = new Set()) {
    this.incompleteLocations = incompleteLocations;
  }

  beforeSchema(_url: string, _instance: JsonNode, context: MatchingSchemaContext): void {
    context.pendingAnnotations = {};
    context.schemaAnnotations = Object.create(null);
    this.subschemaTracker.beforeSchema(context);
  }

  beforeKeyword(keywordNode: Node<unknown>, instance: JsonNode, context: MatchingSchemaContext, schemaContext: MatchingSchemaContext): void {
    const [keywordId, , keywordValue] = keywordNode;

    this.subschemaTracker.beforeKeyword(context);

    switch (keywordId) {
      case "https://json-schema.org/keyword/properties": {
        const properties = keywordValue as Record<string, string>;
        for (const propertyName in properties) {
          const pointer = JsonPointer.append(propertyName, instance.pointer);
          if (this.incompleteLocations.has(pointer)) {
            this.recordBuiltAnnotation(pointer, properties[propertyName], schemaContext);
            context.evaluatedProperties?.add(propertyName);
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
              context.evaluatedProperties?.add(propertyName);
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
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedProperties": {
        const schemaUri = keywordValue as string;
        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !context.schemaEvaluatedProperties!.has(propertyName)) {
            this.recordBuiltAnnotation(pointer, schemaUri, schemaContext);
            context.annotationsUnevaluatedProperties ??= [];
            context.annotationsUnevaluatedProperties.push(propertyName);
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
            context.evaluatedItems?.add(itemIndex);
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
            context.evaluatedItems?.add(itemIndex);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/draft-04/items": {
        if (typeof keywordValue === "string") {
          for (const pointer of this.incompleteLocations) {
            const [parentPointer, indexStr] = splitPointer(pointer);
            const itemIndex = Number(indexStr);
            if (parentPointer === instance.pointer && Number.isInteger(itemIndex)) {
              this.recordBuiltAnnotation(pointer, keywordValue, schemaContext);
              context.evaluatedItems?.add(itemIndex);
            }
          }
        } else {
          const items = keywordValue as string[];
          for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            if (this.incompleteLocations.has(pointer)) {
              this.recordBuiltAnnotation(pointer, items[itemIndex], schemaContext);
              context.evaluatedItems?.add(itemIndex);
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedItems": {
        const schemaUri = keywordValue as string;
        for (const pointer of this.incompleteLocations) {
          const [parentPointer, indexStr] = splitPointer(pointer);
          const itemIndex = Number(indexStr);
          if (parentPointer === instance.pointer && Number.isInteger(itemIndex) && !context.schemaEvaluatedItems!.has(itemIndex)) {
            this.recordBuiltAnnotation(pointer, schemaUri, schemaContext);
            context.annotationsUnevaluatedItems ??= [];
            context.annotationsUnevaluatedItems.push(itemIndex);
          }
        }
        break;
      }
    }
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: MatchingSchemaContext, valid: boolean, schemaContext: MatchingSchemaContext, keyword: Keyword<unknown>): void {
    const [keywordId, , keywordValue] = node;

    // Unevaluated keywords mark incomplete locations as evaluated only after every plugin's beforeKeyword has run.
    // Otherwise, other plugins would see them as already evaluated.
    for (const propertyName of context.annotationsUnevaluatedProperties ?? []) {
      context.evaluatedProperties?.add(propertyName);
    }
    for (const itemIndex of context.annotationsUnevaluatedItems ?? []) {
      context.evaluatedItems?.add(itemIndex);
    }

    this.subschemaTracker.afterKeyword(instance, context, valid, schemaContext);

    if (keyword.annotation) {
      schemaContext.pendingAnnotations ??= {};
      schemaContext.pendingAnnotations[keywordId] = keyword.annotation(keywordValue, instance, context);
    }

    // Annotations are retained for failing subschemas because the instance is
    // usually invalid while it's being edited. Only anyOf/oneOf alternatives
    // that are ruled out by a discriminating location are dropped.
    const subschemaResults = this.subschemaTracker.getSubschemaResults(context);
    let subschemaAnnotations: Annotations[];
    switch (keywordId) {
      case "https://json-schema.org/keyword/anyOf":
      case "https://json-schema.org/keyword/oneOf":
        subschemaAnnotations = this.subschemaTracker.discriminate(subschemaResults, instance);
        break;

      default:
        subschemaAnnotations = subschemaResults.map((result) => result.value);
    }

    for (const annotations of subschemaAnnotations) {
      appendAnnotations(schemaContext.schemaAnnotations!, annotations);
    }
  }

  afterSchema(_schemaUri: string, instance: JsonNode, context: MatchingSchemaContext, valid: boolean): void {
    if (valid && context.pendingAnnotations) {
      appendAnnotations(context.schemaAnnotations!, { [instance.pointer]: [context.pendingAnnotations] });
    }

    this.subschemaTracker.afterSchema(instance, context, valid, context.schemaAnnotations!);

    this.annotations = context.schemaAnnotations!;
  }

  getAnnotations(instanceLocation: string): Annotation[] {
    return this.annotations[instanceLocation] ?? [];
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
    appendAnnotations(context.schemaAnnotations!, { [pointer]: this.buildAnnotations(schemaLocation, context) });
  }
}

function appendAnnotations(target: Annotations, source: Annotations) {
  for (const pointer in source) {
    target[pointer] ??= [];
    target[pointer].push(...source[pointer]);
  }
}

function splitPointer(pointer: string): [string, string] {
  const lastSlash = pointer.lastIndexOf("/");
  const propertyName = pointer.slice(lastSlash + 1)
    .replace(/~1/g, "/")
    .replace(/~0/g, "~");
  return [pointer.slice(0, lastSlash), propertyName];
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
