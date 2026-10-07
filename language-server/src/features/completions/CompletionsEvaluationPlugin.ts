import * as Instance from "@hyperjump/json-schema/instance/experimental";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { JsonValueSet } from "./JsonValueSet.ts";
import { SubschemaTracker } from "../SubschemaTracker.ts";
import { addKeywordAnnotation } from "../AnnotationsEvaluationPlugin.ts";

import type { EvaluationPlugin, Node, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { JsonSchemaType, ValueEntry } from "./JsonValueSet.ts";
import type { Annotation } from "../AnnotationsEvaluationPlugin.ts";

type CompletionsContext = ValidationContext & {
  completions?: Record<string, JsonValueSet>;
  dynamicAnchors?: Record<string, string>;
  evaluatedProperties?: Set<string>;
  schemaEvaluatedProperties?: Set<string>;
  evaluatedItems?: Set<number>;
  schemaEvaluatedItems?: Set<number>;
  completionsUnevaluatedProperties?: string[];
  completionsUnevaluatedItems?: number[];
};

export class CompletionsEvaluationPlugin implements EvaluationPlugin<CompletionsContext> {
  static readonly id = "completions";

  private completions: Record<string, JsonValueSet> = Object.create(null);
  private incompleteLocations: Set<string>;
  private subschemaTracker = new SubschemaTracker<Record<string, JsonValueSet>>();

  constructor(incompleteLocations: Set<string>) {
    this.incompleteLocations = incompleteLocations;
  }

  beforeSchema(_url: string, _instance: JsonNode, context: CompletionsContext): void {
    context.completions = Object.create(null);
    this.subschemaTracker.beforeSchema(context);
  }

  beforeKeyword(keywordNode: Node<unknown>, instance: JsonNode, context: CompletionsContext, schemaContext: CompletionsContext): void {
    const [keywordId, , keywordValue] = keywordNode;

    this.subschemaTracker.beforeKeyword(context);

    switch (keywordId) {
      case "https://json-schema.org/keyword/properties": {
        const properties = keywordValue as Record<string, string>;
        for (const propertyName in properties) {
          const pointer = JsonPointer.append(propertyName, instance.pointer);
          const schemaUri = properties[propertyName];
          const completions = this.buildCompletions(schemaUri, schemaContext);
          schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

          if (this.incompleteLocations.has(pointer)) {
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/additionalProperties": {
        const [isDeclaredProperty, schemaUri] = keywordValue as [RegExp, string];

        const completions = this.buildCompletions(schemaUri, schemaContext);
        for (const propertyNameNode of Instance.keys(instance)) {
          const propertyName = Instance.value(propertyNameNode) as string;
          if (!isDeclaredProperty.test(propertyName)) {
            const pointer = JsonPointer.append(propertyName, instance.pointer);
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
          }
        }

        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !isDeclaredProperty.test(propertyName)) {
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/patternProperties": {
        const patternProperties = keywordValue as [RegExp, string][];

        for (const [pattern, schemaUri] of patternProperties) {
          const completions = this.buildCompletions(schemaUri, schemaContext);
          for (const propertyNameNode of Instance.keys(instance)) {
            const propertyName = Instance.value(propertyNameNode) as string;
            if (pattern.test(propertyName)) {
              const pointer = JsonPointer.append(propertyName, instance.pointer);
              schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
            }
          }

          for (const pointer of this.incompleteLocations) {
            const [parentPointer, propertyName] = splitPointer(pointer);
            if (parentPointer === instance.pointer && pattern.test(propertyName)) {
              schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
              context.evaluatedProperties?.add(propertyName);
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedProperties": {
        const schemaUri = keywordValue as string;

        const completions = this.buildCompletions(schemaUri, schemaContext);
        for (const propertyNameNode of Instance.keys(instance)) {
          const propertyName = Instance.value(propertyNameNode) as string;
          if (!context.schemaEvaluatedProperties!.has(propertyName)) {
            const pointer = JsonPointer.append(propertyName, instance.pointer);
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
          }
        }

        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !context.schemaEvaluatedProperties!.has(propertyName)) {
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
            context.completionsUnevaluatedProperties ??= [];
            context.completionsUnevaluatedProperties.push(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/draft-04/additionalItems":
      case "https://json-schema.org/keyword/items": {
        const [numberOfPrefixItems, schemaUri] = keywordValue as [number, string];

        const completions = this.buildCompletions(schemaUri, schemaContext);
        for (let itemIndex = numberOfPrefixItems; itemIndex <= Instance.length(instance); itemIndex++) {
          const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
          schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

          if (this.incompleteLocations.has(pointer)) {
            context.evaluatedItems?.add(Number(itemIndex));
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/draft-04/items": {
        if (typeof keywordValue === "string") {
          const completions = this.buildCompletions(keywordValue, schemaContext);
          for (let itemIndex = 0; itemIndex <= Instance.length(instance); itemIndex++) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

            if (this.incompleteLocations.has(pointer)) {
              context.evaluatedItems?.add(Number(itemIndex));
            }
          }
        } else {
          const items = keywordValue as string[];

          for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            const completions = this.buildCompletions(items[itemIndex], schemaContext);
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

            if (this.incompleteLocations.has(pointer)) {
              context.evaluatedItems?.add(Number(itemIndex));
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/prefixItems": {
        const prefixItems = keywordValue as string[];

        for (let itemIndex = 0; itemIndex < prefixItems.length; itemIndex++) {
          const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
          const completions = this.buildCompletions(prefixItems[itemIndex], schemaContext);
          schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

          if (this.incompleteLocations.has(pointer)) {
            context.evaluatedItems?.add(Number(itemIndex));
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedItems": {
        const schemaUri = keywordValue as string;

        const completions = this.buildCompletions(schemaUri, schemaContext);
        for (let itemIndex = 0; itemIndex <= Instance.length(instance); itemIndex++) {
          if (!context.schemaEvaluatedItems!.has(itemIndex)) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

            if (this.incompleteLocations.has(pointer)) {
              context.completionsUnevaluatedItems ??= [];
              context.completionsUnevaluatedItems.push(itemIndex);
            }
          }
        }
        break;
      }
    }
  }

  afterKeyword(keywordNode: Node<unknown>, instance: JsonNode, context: CompletionsContext, valid: boolean, schemaContext: CompletionsContext): void {
    // Unevaluated keywords mark incomplete locations as evaluated only after every plugin's beforeKeyword has run.
    // Otherwise, other plugins would see them as already evaluated.
    for (const propertyName of context.completionsUnevaluatedProperties ?? []) {
      context.evaluatedProperties?.add(propertyName);
    }
    for (const itemIndex of context.completionsUnevaluatedItems ?? []) {
      context.evaluatedItems?.add(itemIndex);
    }

    this.subschemaTracker.afterKeyword(instance, context, valid, schemaContext);

    const [keywordId] = keywordNode;
    const subschemaResults = this.subschemaTracker.getSubschemaResults(context);
    let combinedCompletions: Record<string, JsonValueSet> = Object.create(null);

    switch (keywordId) {
      case "https://json-schema.org/keyword/anyOf": {
        for (const subschemaCompletions of this.subschemaTracker.discriminate(subschemaResults, instance)) {
          combinedCompletions = this.union(combinedCompletions, subschemaCompletions);
        }
        break;
      }

      case "https://json-schema.org/keyword/oneOf": {
        combinedCompletions = this.exclusiveUnion(this.subschemaTracker.discriminate(subschemaResults, instance));
        break;
      }

      case "https://json-schema.org/keyword/if":
        break;

      case "https://json-schema.org/keyword/not": {
        for (const subschemaResult of subschemaResults) {
          combinedCompletions = this.negate(combinedCompletions, subschemaResult.value);
        }
        break;
      }

      default:
        for (const subschemaResult of subschemaResults) {
          combinedCompletions = this.intersection(combinedCompletions, subschemaResult.value);
        }
    }

    schemaContext.completions = this.intersection(schemaContext.completions!, combinedCompletions);
  }

  afterSchema(_url: string, instance: JsonNode, context: CompletionsContext, valid: boolean): void {
    this.subschemaTracker.afterSchema(instance, context, valid, context.completions!);

    this.completions = context.completions!;
  }

  * getCompletions(pointer: string) {
    const valueSet = this.completions[pointer] ?? new JsonValueSet();
    for (const completion of valueSet) {
      if (completion.kind === "value") {
        yield completion;
      } else {
        for (const value of completion.included) {
          yield { kind: "value", value, annotations: valueSet.getValueAnnotations(value) } as ValueEntry;
        }

        yield completion;
      }
    }
  }

  getPropertyCompletions(pointer: string) {
    const propertyNames: string[] = [];

    for (const completionPointer in this.completions) {
      const [parentPointer, propertyName] = splitPointer(completionPointer);
      if (parentPointer !== pointer) {
        continue;
      }

      if (!this.completions[completionPointer].isEmpty()) {
        propertyNames.push(propertyName);
      }
    }

    return propertyNames;
  }

  // `inProgress` holds the schemas currently being expanded so a schema that
  // references itself in-place doesn't recurse forever. A cycle adds no
  // information, so it's treated as unconstrained.
  private buildCompletions(schemaLocation: string, context: CompletionsContext, inProgress: Set<string> = new Set()): JsonValueSet {
    if (inProgress.has(schemaLocation)) {
      return JsonValueSet.any();
    }

    const nodes = context.ast[schemaLocation];

    if (nodes === true) {
      return JsonValueSet.any();
    }

    if (nodes === false) {
      return new JsonValueSet();
    }

    inProgress.add(schemaLocation);

    const completions = Pact.pipe(
      nodes,
      Pact.map((node) => {
        const [keywordId, , keywordValue] = node;

        switch (keywordId) {
          case "https://json-schema.org/keyword/const":
            return new JsonValueSet().addValue(keywordValue as string);

          case "https://json-schema.org/keyword/enum":
            return (keywordValue as string[]).reduce((set, value) => set.addValue(value), new JsonValueSet());

          case "https://json-schema.org/keyword/type": {
            const types = Array.isArray(keywordValue) ? keywordValue : [keywordValue];
            return (types as JsonSchemaType[]).reduce((set, type) => set.addType(type), new JsonValueSet());
          }

          case "https://json-schema.org/keyword/ref":
            return this.buildCompletions(keywordValue as string, context, inProgress);

          case "https://json-schema.org/keyword/dynamicRef":
            return this.buildCompletions(context.dynamicAnchors![keywordValue as string], context, inProgress);

          case "https://json-schema.org/keyword/draft-2020-12/dynamicRef": {
            const [, fragment, ref] = keywordValue as [string, string, string];
            return this.buildCompletions(context.dynamicAnchors![fragment] ?? ref, context, inProgress);
          }

          case "https://json-schema.org/keyword/allOf":
            return (keywordValue as string[]).reduce((valueSet, subSchemaLocation) => {
              return valueSet.intersect(this.buildCompletions(subSchemaLocation, context, inProgress));
            }, JsonValueSet.any());

          case "https://json-schema.org/keyword/anyOf":
            return (keywordValue as string[]).reduce((valueSet, subSchemaLocation) => {
              return valueSet.union(this.buildCompletions(subSchemaLocation, context, inProgress).withMemberAnnotations());
            }, new JsonValueSet());

          case "https://json-schema.org/keyword/oneOf":
            return JsonValueSet.exclusiveUnion(
              (keywordValue as string[]).map((subSchemaLocation) => {
                return this.buildCompletions(subSchemaLocation, context, inProgress).withMemberAnnotations();
              })
            );

          case "https://json-schema.org/keyword/not":
            return this.buildCompletions(keywordValue as string, context, inProgress).complement();

          default:
            return JsonValueSet.any();
        }
      }),
      Pact.reduce((valueSet, keywordValueSet) => valueSet.intersect(keywordValueSet), JsonValueSet.any())
    );

    const annotation: Annotation = {};
    for (const node of nodes) {
      addKeywordAnnotation(annotation, node, context);
    }

    if (Object.keys(annotation).length > 0) {
      completions.annotate(annotation);
    }

    inProgress.delete(schemaLocation);

    return completions;
  }

  private intersection(a: Record<string, JsonValueSet>, b: Record<string, JsonValueSet>): Record<string, JsonValueSet> {
    const result: Record<string, JsonValueSet> = Object.create(null);
    for (const instanceLocation in a) {
      result[instanceLocation] = a[instanceLocation];
    }
    for (const instanceLocation in b) {
      result[instanceLocation] = result[instanceLocation] ? result[instanceLocation].intersect(b[instanceLocation]) : b[instanceLocation];
    }
    return result;
  }

  private union(a: Record<string, JsonValueSet>, b: Record<string, JsonValueSet>): Record<string, JsonValueSet> {
    const result: Record<string, JsonValueSet> = Object.create(null);
    for (const instanceLocation in a) {
      result[instanceLocation] = a[instanceLocation];
    }
    for (const instanceLocation in b) {
      result[instanceLocation] = result[instanceLocation] ? result[instanceLocation].union(b[instanceLocation]) : b[instanceLocation];
    }
    return result;
  }

  private negate(a: Record<string, JsonValueSet>, b: Record<string, JsonValueSet>): Record<string, JsonValueSet> {
    const result: Record<string, JsonValueSet> = Object.create(null);
    for (const instanceLocation in a) {
      result[instanceLocation] = a[instanceLocation];
    }
    for (const instanceLocation in b) {
      const negated = b[instanceLocation].complement();
      result[instanceLocation] = result[instanceLocation] ? result[instanceLocation].union(negated) : negated;
    }
    return result;
  }

  private exclusiveUnion(records: Record<string, JsonValueSet>[]): Record<string, JsonValueSet> {
    const pointers = new Set<string>();
    for (const record of records) {
      for (const pointer in record) {
        pointers.add(pointer);
      }
    }

    const result: Record<string, JsonValueSet> = Object.create(null);
    for (const pointer of pointers) {
      result[pointer] = Pact.pipe(
        records,
        Pact.map((record) => record[pointer]),
        Pact.filter((set) => set !== undefined),
        Pact.collectArray,
        (sets) => JsonValueSet.exclusiveUnion(sets)
      );
    }

    return result;
  }
}

const splitPointer = (pointer: string) => {
  const position = pointer.lastIndexOf("/");
  const parentPointer = pointer.slice(0, position);
  const propertyName = pointer.slice(position + 1)
    .replace(/~1/g, "/")
    .replace(/~0/g, "~");
  return [parentPointer, propertyName];
};
