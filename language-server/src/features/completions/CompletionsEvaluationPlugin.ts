import * as Instance from "@hyperjump/json-schema/instance/experimental";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { CompletionsSet } from "./CompletionsSet.ts";

import type { EvaluationPlugin, Node, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";

type CompletionsContext = ValidationContext & {
  completions?: Record<string, CompletionsSet>;
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
  completions: Record<string, CompletionsSet>;
  failedLocations: Set<string>;
};

export class CompletionsEvaluationPlugin implements EvaluationPlugin<CompletionsContext> {
  private completions: Record<string, CompletionsSet> = Object.create(null);
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
          schemaContext.completions![pointer] ??= CompletionsSet.any();
          schemaContext.completions![pointer].intersection(this.buildCompletions(schemaUri, schemaContext));
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
            schemaContext.completions![pointer] ??= CompletionsSet.any();
            schemaContext.completions![pointer].intersection(completions);
          }
        }

        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !isDeclaredProperty.test(propertyName)) {
            schemaContext.completions![pointer] ??= CompletionsSet.any();
            schemaContext.completions![pointer].intersection(this.buildCompletions(schemaUri, schemaContext));
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
              schemaContext.completions![pointer] ??= CompletionsSet.any();
              schemaContext.completions![pointer].intersection(completions);
            }
          }

          for (const pointer of this.incompleteLocations) {
            const [parentPointer, propertyName] = splitPointer(pointer);
            if (parentPointer === instance.pointer && pattern.test(propertyName)) {
              schemaContext.completions![pointer] ??= CompletionsSet.any();
              schemaContext.completions![pointer].intersection(completions);
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
            schemaContext.completions![pointer] ??= CompletionsSet.any();
            schemaContext.completions![pointer].intersection(completions);
          }
        }

        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !context.schemaEvaluatedProperties!.has(propertyName)) {
            schemaContext.completions![pointer] ??= CompletionsSet.any();
            schemaContext.completions![pointer].intersection(completions);
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
          schemaContext.completions![pointer] ??= CompletionsSet.any();
          schemaContext.completions![pointer].intersection(completions);

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
            schemaContext.completions![pointer] ??= CompletionsSet.any();
            schemaContext.completions![pointer].intersection(completions);

            if (this.incompleteLocations.has(pointer)) {
              context.evaluatedItems?.add(Number(itemIndex));
            }
          }
        } else {
          const items = keywordValue as string[];

          for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            schemaContext.completions![pointer] ??= CompletionsSet.any();
            schemaContext.completions![pointer].intersection(this.buildCompletions(items[itemIndex], schemaContext));

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
          schemaContext.completions![pointer] ??= CompletionsSet.any();
          schemaContext.completions![pointer].intersection(this.buildCompletions(prefixItems[itemIndex], schemaContext));

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
            schemaContext.completions![pointer] ??= CompletionsSet.any();
            schemaContext.completions![pointer].intersection(completions);

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
    const combinedCompletions = Object.create(null);

    switch (keywordId) {
      case "https://json-schema.org/keyword/anyOf": {
        for (const subschemaCompletions of this.discriminate(context.subschemaResults!, instance)) {
          this.union(combinedCompletions, subschemaCompletions);
        }
        break;
      }

      case "https://json-schema.org/keyword/oneOf": {
        for (const subschemaCompletions of this.discriminate(context.subschemaResults!, instance)) {
          this.symmetricDifference(combinedCompletions, subschemaCompletions);
        }
        break;
      }

      case "https://json-schema.org/keyword/if":
        break;

      case "https://json-schema.org/keyword/not": {
        for (const subschemaResult of context.subschemaResults!) {
          this.negate(combinedCompletions, subschemaResult.completions);
        }
        break;
      }

      default:
        for (const subschemaResult of context.subschemaResults!) {
          this.intersection(combinedCompletions, subschemaResult.completions);
        }
    }

    this.intersection(schemaContext.completions!, combinedCompletions);
  }

  afterSchema(_url: string, _instance: JsonNode, context: CompletionsContext): void {
    for (const location of context.schemaFailedLocations!) {
      context.failedLocations!.add(location);
    }

    context.subschemaResults?.push({
      completions: context.completions!,
      failedLocations: context.schemaFailedLocations!
    });

    this.completions = context.completions!;
  }

  getCompletions(pointer: string) {
    return this.completions[pointer] ?? new CompletionsSet();
  }

  private buildCompletions(schemaLocation: string, context: CompletionsContext): CompletionsSet {
    const nodes = context.ast[schemaLocation];

    if (nodes === true) {
      return CompletionsSet.fromTypes(["null", "boolean", "number", "string", "array", "object"], schemaLocation);
    }

    if (nodes === false) {
      return CompletionsSet.any().negate();
    }

    return Pact.pipe(
      nodes,
      Pact.map((node) => {
        const [keywordId, schemaLocation, keywordValue] = node;

        switch (keywordId) {
          case "https://json-schema.org/keyword/const":
            return CompletionsSet.fromValues([keywordValue as string], schemaLocation);

          case "https://json-schema.org/keyword/enum":
            return CompletionsSet.fromValues(keywordValue as string[], schemaLocation);

          case "https://json-schema.org/keyword/type":
            const types = Array.isArray(keywordValue) ? keywordValue : [keywordValue];
            return CompletionsSet.fromTypes(types, schemaLocation);

          case "https://json-schema.org/keyword/ref":
            return this.buildCompletions(keywordValue as string, context);

          case "https://json-schema.org/keyword/dynamicRef":
            return this.buildCompletions(context.dynamicAnchors![keywordValue as string], context);

          case "https://json-schema.org/keyword/draft-2020-12/dynamicRef": {
            const [, fragment, ref] = keywordValue as [string, string, string];
            return this.buildCompletions(context.dynamicAnchors![fragment] ?? ref, context);
          }

          case "https://json-schema.org/keyword/allOf":
            return (keywordValue as string[]).reduce((completionsSet, subSchemaLocation) => {
              return completionsSet.intersection(this.buildCompletions(subSchemaLocation, context));
            }, CompletionsSet.any());

          case "https://json-schema.org/keyword/anyOf":
            return (keywordValue as string[]).reduce((completionsSet, subSchemaLocation) => {
              return completionsSet.union(this.buildCompletions(subSchemaLocation, context));
            }, new CompletionsSet());

          case "https://json-schema.org/keyword/oneOf":
            return (keywordValue as string[]).reduce((completionsSet, subSchemaLocation) => {
              return completionsSet.symmetricDifference(this.buildCompletions(subSchemaLocation, context));
            }, new CompletionsSet());

          case "https://json-schema.org/keyword/not":
            return this.buildCompletions(keywordValue as string, context).negate();

          default:
            return CompletionsSet.any();
        }
      }),
      Pact.reduce((completionsSet, keywordCompletionsSet) => completionsSet.intersection(keywordCompletionsSet), CompletionsSet.any())
    );
  }

  private intersection(a: Record<string, CompletionsSet>, b: Record<string, CompletionsSet>) {
    for (const instanceLocation in b) {
      if (a[instanceLocation]) {
        a[instanceLocation].intersection(b[instanceLocation]);
      } else {
        a[instanceLocation] = b[instanceLocation];
      }
    }
  }

  private union(a: Record<string, CompletionsSet>, b: Record<string, CompletionsSet>) {
    for (const instanceLocation in b) {
      if (a[instanceLocation]) {
        a[instanceLocation].union(b[instanceLocation]);
      } else {
        a[instanceLocation] = b[instanceLocation];
      }
    }
  }

  private symmetricDifference(a: Record<string, CompletionsSet>, b: Record<string, CompletionsSet>) {
    for (const instanceLocation in b) {
      if (a[instanceLocation]) {
        a[instanceLocation].symmetricDifference(b[instanceLocation]);
      } else {
        a[instanceLocation] = b[instanceLocation];
      }
    }
  }

  private negate(a: Record<string, CompletionsSet>, b: Record<string, CompletionsSet>) {
    for (const instanceLocation in b) {
      if (a[instanceLocation]) {
        a[instanceLocation].union(b[instanceLocation].negate());
      } else {
        a[instanceLocation] = b[instanceLocation].negate();
      }
    }
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

    const passingAlternatives: Record<string, CompletionsSet>[] = [];
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
  const propertyName = pointer.slice(position + 1);
  return [parentPointer, propertyName];
};
