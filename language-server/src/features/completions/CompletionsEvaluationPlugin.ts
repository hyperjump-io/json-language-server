import * as Instance from "@hyperjump/json-schema/instance/experimental";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { JsonValueSet } from "./JsonValueSet.ts";

import type { EvaluationPlugin, Node, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { JsonSchemaType, ValueEntry } from "./JsonValueSet.ts";

type CompletionsContext = ValidationContext & {
  completions?: Record<string, JsonValueSet>;
  subschemaResults?: SubschemaResult[];
  failedLocations?: Set<string>;
  schemaFailedLocations?: Set<string>;
  dynamicAnchors?: Record<string, string>;
  evaluatedProperties?: Set<string>;
  schemaEvaluatedProperties?: Set<string>;
  evaluatedItems?: Set<number>;
  schemaEvaluatedItems?: Set<number>;
};

type SubschemaResult = {
  completions: Record<string, JsonValueSet>;
  failedLocations: Set<string>;
};

export class CompletionsEvaluationPlugin implements EvaluationPlugin<CompletionsContext> {
  private completions: Record<string, JsonValueSet> = Object.create(null);
  private incompleteLocations: Set<string>;

  constructor(incompleteLocations: Set<string>) {
    this.incompleteLocations = incompleteLocations;
  }

  beforeSchema(_url: string, _instance: JsonNode, context: CompletionsContext): void {
    context.completions = Object.create(null);
    context.failedLocations ??= new Set();
    context.schemaFailedLocations = new Set();
  }

  beforeKeyword(keywordNode: Node<unknown>, instance: JsonNode, context: CompletionsContext, schemaContext: CompletionsContext): void {
    const [keywordId, , keywordValue] = keywordNode;

    context.subschemaResults = [];

    switch (keywordId) {
      case "https://json-schema.org/keyword/properties": {
        const properties = keywordValue as Record<string, string>;
        for (const propertyName in properties) {
          const pointer = JsonPointer.append(propertyName, instance.pointer);
          const schemaUri = properties[propertyName];
          const completions = this.buildCompletions(schemaUri, schemaContext);
          schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
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
            context.evaluatedProperties?.add(propertyName);
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
              context.evaluatedItems?.add(Number(itemIndex));
            }
          }
        }
        break;
      }
    }
  }

  afterKeyword(keywordNode: Node<unknown>, instance: JsonNode, context: CompletionsContext, valid: boolean, schemaContext: CompletionsContext): void {
    if (!valid) {
      schemaContext.schemaFailedLocations!.add(instance.pointer);
      for (const location of context.failedLocations! ?? []) {
        schemaContext.schemaFailedLocations!.add(location);
      }
    }

    const [keywordId] = keywordNode;
    let combinedCompletions: Record<string, JsonValueSet> = Object.create(null);

    switch (keywordId) {
      case "https://json-schema.org/keyword/anyOf": {
        for (const subschemaCompletions of this.discriminate(context.subschemaResults!, instance)) {
          combinedCompletions = this.union(combinedCompletions, subschemaCompletions);
        }
        break;
      }

      case "https://json-schema.org/keyword/oneOf": {
        combinedCompletions = this.exclusiveUnion(this.discriminate(context.subschemaResults!, instance));
        break;
      }

      case "https://json-schema.org/keyword/if":
        break;

      case "https://json-schema.org/keyword/not": {
        for (const subschemaResult of context.subschemaResults!) {
          combinedCompletions = this.negate(combinedCompletions, subschemaResult.completions);
        }
        break;
      }

      default:
        for (const subschemaResult of context.subschemaResults!) {
          combinedCompletions = this.intersection(combinedCompletions, subschemaResult.completions);
        }
    }

    schemaContext.completions = this.intersection(schemaContext.completions!, combinedCompletions);
  }

  afterSchema(_url: string, instance: JsonNode, context: CompletionsContext, valid: boolean): void {
    if (!valid) {
      context.schemaFailedLocations!.add(instance.pointer);
    }

    for (const location of context.schemaFailedLocations!) {
      context.failedLocations!.add(location);
    }

    context.subschemaResults?.push({
      completions: context.completions!,
      failedLocations: context.schemaFailedLocations!
    });

    this.completions = context.completions!;
  }

  * getCompletions(pointer: string) {
    for (const completion of this.completions[pointer] ?? new JsonValueSet()) {
      if (completion.kind === "value") {
        yield completion;
      } else {
        for (const value of completion.included) {
          yield { kind: "value", value } as ValueEntry;
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

  private buildCompletions(schemaLocation: string, context: CompletionsContext): JsonValueSet {
    const nodes = context.ast[schemaLocation];

    if (nodes === true) {
      return JsonValueSet.any();
    }

    if (nodes === false) {
      return new JsonValueSet();
    }

    return Pact.pipe(
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
            return this.buildCompletions(keywordValue as string, context);

          case "https://json-schema.org/keyword/dynamicRef":
            return this.buildCompletions(context.dynamicAnchors![keywordValue as string], context);

          case "https://json-schema.org/keyword/draft-2020-12/dynamicRef": {
            const [, fragment, ref] = keywordValue as [string, string, string];
            return this.buildCompletions(context.dynamicAnchors![fragment] ?? ref, context);
          }

          case "https://json-schema.org/keyword/allOf":
            return (keywordValue as string[]).reduce((valueSet, subSchemaLocation) => {
              return valueSet.intersect(this.buildCompletions(subSchemaLocation, context));
            }, JsonValueSet.any());

          case "https://json-schema.org/keyword/anyOf":
            return (keywordValue as string[]).reduce((valueSet, subSchemaLocation) => {
              return valueSet.union(this.buildCompletions(subSchemaLocation, context));
            }, new JsonValueSet());

          case "https://json-schema.org/keyword/oneOf":
            return JsonValueSet.exclusiveUnion(
              (keywordValue as string[]).map((subSchemaLocation) => this.buildCompletions(subSchemaLocation, context))
            );

          case "https://json-schema.org/keyword/not":
            return this.buildCompletions(keywordValue as string, context).complement();

          default:
            return JsonValueSet.any();
        }
      }),
      Pact.reduce((valueSet, keywordValueSet) => valueSet.intersect(keywordValueSet), JsonValueSet.any())
    );
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

  private discriminate(alternatives: SubschemaResult[], instance: JsonNode) {
    const locations: string[] = [];
    switch (Instance.typeOf(instance)) {
      case "object":
        for (const propertyValueNode of Instance.values(instance)) {
          locations.push(propertyValueNode.pointer);
        }
        break;

      case "array":
        for (const itemNode of Instance.iter(instance)) {
          locations.push(itemNode.pointer);
        }
        break;

      default:
        locations.push(instance.pointer);
    }

    const passingLocations: Set<string> = new Set();
    for (const alternative of alternatives) {
      for (const pointer of locations) {
        if (!alternative.failedLocations.has(pointer)) {
          passingLocations.add(pointer);
        }
      }
    }

    const passingAlternatives: Record<string, JsonValueSet>[] = [];
    for (const alternative of alternatives) {
      if (locations.some((pointer) => alternative.failedLocations.has(pointer) && passingLocations.has(pointer))) {
        continue;
      }

      passingAlternatives.push(alternative.completions);
    }

    return passingAlternatives;
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
