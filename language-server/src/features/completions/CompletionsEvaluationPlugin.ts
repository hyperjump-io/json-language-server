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
};

export class CompletionsEvaluationPlugin implements EvaluationPlugin<CompletionsContext> {
  private completions: Record<string, CompletionsSet> = Object.create(null);

  beforeSchema(_url: string, _instance: JsonNode, context: CompletionsContext): void {
    context.completions = Object.create(null);
  }

  beforeKeyword(keywordNode: Node<unknown>, _instance: JsonNode, context: CompletionsContext): void {
    const [keywordId] = keywordNode;

    context.parentKeywordId = keywordId;
    context.parentCompletions = Object.create(null);
  }

  afterKeyword(keywordNode: Node<unknown>, instance: JsonNode, context: CompletionsContext, _valid: boolean, schemaContext: CompletionsContext): void {
    const [keywordId, , keywordValue] = keywordNode;

    if (keywordId === "https://json-schema.org/keyword/properties") {
      const properties = keywordValue as Record<string, string>;
      for (const propertyName in properties) {

        const propertyPointer = JsonPointer.append(propertyName, instance.pointer);
        schemaContext.completions[propertyPointer] = this.buildCompletions(properties[propertyName], schemaContext);
      }
    }

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
    return this.completions[pointer] ?? [];
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
