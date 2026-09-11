import * as Instance from "@hyperjump/json-schema/instance/experimental";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { CompletionsSet } from "./CompletionsSet.ts";

import type { EvaluationPlugin, Node, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";

type CompletionsContext = ValidationContext & {
  completions: Record<string, CompletionsSet>;
  parentCompletions: Record<string, CompletionsSet>;
  parentKeywordId: string;
  dynamicAnchors?: Record<string, string>;
  evaluatedProperties?: Set<string>;
  schemaEvaluatedProperties?: Set<string>;
};

export class CompletionsEvaluationPlugin implements EvaluationPlugin<CompletionsContext> {
  private completions: Record<string, CompletionsSet> = Object.create(null);
  private incompleteLocations: Set<string>;

  constructor(incompleteLocations: Set<string>) {
    this.incompleteLocations = incompleteLocations;
  }

  beforeSchema(_url: string, _instance: JsonNode, context: CompletionsContext): void {
    context.completions = Object.create(null);
  }

  beforeKeyword(keywordNode: Node<unknown>, instance: JsonNode, context: CompletionsContext, schemaContext: CompletionsContext): void {
    const [keywordId, , keywordValue] = keywordNode;

    context.parentKeywordId = keywordId;
    context.parentCompletions = Object.create(null);

    switch (keywordId) {
      case "https://json-schema.org/keyword/properties": {
        const properties = keywordValue as Record<string, string>;
        for (const propertyName in properties) {
          const pointer = JsonPointer.append(propertyName, instance.pointer);
          const schemaUri = properties[propertyName];
          schemaContext.completions[pointer] ??= CompletionsSet.any();
          schemaContext.completions[pointer].intersection(this.buildCompletions(schemaUri, schemaContext));
        }
        break;
      }

      case "https://json-schema.org/keyword/additionalProperties": {
        const [isDeclaredProperty, schemaUri] = keywordValue as [RegExp, string];

        for (const propertyNameNode of Instance.keys(instance)) {
          const propertyName = Instance.value(propertyNameNode) as string;
          if (!isDeclaredProperty.test(propertyName)) {
            const pointer = JsonPointer.append(propertyName, instance.pointer);
            schemaContext.completions[pointer] ??= CompletionsSet.any();
            schemaContext.completions[pointer].intersection(this.buildCompletions(schemaUri, schemaContext));
          }
        }

        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !isDeclaredProperty.test(propertyName)) {
            schemaContext.completions[pointer] ??= CompletionsSet.any();
            schemaContext.completions[pointer].intersection(this.buildCompletions(schemaUri, schemaContext));
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/patternProperties": {
        const patternProperties = keywordValue as [RegExp, string][];

        for (const [pattern, schemaUri] of patternProperties) {
          for (const propertyNameNode of Instance.keys(instance)) {
            const propertyName = Instance.value(propertyNameNode) as string;
            if (pattern.test(propertyName)) {
              const pointer = JsonPointer.append(propertyName, instance.pointer);
              schemaContext.completions[pointer] ??= CompletionsSet.any();
              schemaContext.completions[pointer].intersection(this.buildCompletions(schemaUri, schemaContext));
            }
          }

          for (const pointer of this.incompleteLocations) {
            const [parentPointer, propertyName] = splitPointer(pointer);
            if (parentPointer === instance.pointer && pattern.test(propertyName)) {
              schemaContext.completions[pointer] ??= CompletionsSet.any();
              schemaContext.completions[pointer].intersection(this.buildCompletions(schemaUri, schemaContext));
              context.evaluatedProperties?.add(propertyName);
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedProperties": {
        const schemaUri = keywordValue as string;

        for (const propertyNameNode of Instance.keys(instance)) {
          const propertyName = Instance.value(propertyNameNode) as string;
          if (!context.schemaEvaluatedProperties!.has(propertyName)) {
            const pointer = JsonPointer.append(propertyName, instance.pointer);
            schemaContext.completions[pointer] ??= CompletionsSet.any();
            schemaContext.completions[pointer].intersection(this.buildCompletions(schemaUri, schemaContext));
          }
        }

        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !context.schemaEvaluatedProperties!.has(propertyName)) {
            schemaContext.completions[pointer] ??= CompletionsSet.any();
            schemaContext.completions[pointer].intersection(this.buildCompletions(schemaUri, schemaContext));
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }
    }
  }

  afterKeyword(_keywordNode: Node<unknown>, _instance: JsonNode, context: CompletionsContext, _valid: boolean, schemaContext: CompletionsContext): void {
    this.intersection(schemaContext.completions, context.parentCompletions);
  }

  afterSchema(_url: string, _instance: JsonNode, context: CompletionsContext): void {
    switch (context.parentKeywordId) {
      case "https://json-schema.org/keyword/allOf":
        this.intersection(context.parentCompletions, context.completions);
        break;

      case "https://json-schema.org/keyword/anyOf":
        this.union(context.parentCompletions, context.completions);
        break;

      case "https://json-schema.org/keyword/oneOf":
        this.symetricDifference(context.parentCompletions, context.completions);
        break;

      case "https://json-schema.org/keyword/if":
        break;

      default:
        this.intersection(this.completions, context.completions);
    }
  }

  getCompletions(pointer: string) {
    return this.completions[pointer] ?? new CompletionsSet();
  }

  buildCompletions(schemaLocation: string, context: CompletionsContext): CompletionsSet {
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
              return completionsSet.symetricDifference(this.buildCompletions(subSchemaLocation, context));
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

  intersection(a: Record<string, CompletionsSet>, b: Record<string, CompletionsSet>) {
    for (const instanceLocation in b) {
      if (a[instanceLocation]) {
        a[instanceLocation].intersection(b[instanceLocation]);
      } else {
        a[instanceLocation] = b[instanceLocation];
      }
    }
  }

  union(a: Record<string, CompletionsSet>, b: Record<string, CompletionsSet>) {
    for (const instanceLocation in b) {
      if (a[instanceLocation]) {
        a[instanceLocation].union(b[instanceLocation]);
      } else {
        a[instanceLocation] = b[instanceLocation];
      }
    }
  }

  symetricDifference(a: Record<string, CompletionsSet>, b: Record<string, CompletionsSet>) {
    for (const instanceLocation in b) {
      if (a[instanceLocation]) {
        a[instanceLocation].symetricDifference(b[instanceLocation]);
      } else {
        a[instanceLocation] = b[instanceLocation];
      }
    }
  }
}

const splitPointer = (pointer: string) => {
  const position = pointer.lastIndexOf("/");
  const parentPointer = pointer.slice(0, position);
  const propertyName = pointer.slice(position + 1);
  return [parentPointer, propertyName];
};
