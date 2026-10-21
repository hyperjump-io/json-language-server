import * as Instance from "@hyperjump/json-schema/instance/experimental";

import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";

export type SubschemaResult<T> = {
  value: T;
  failedLocations: Set<string>;
  failedType: boolean;
};

type SchemaFailures = {
  failedLocations: Set<string>;
  failedType: boolean;
};

/**
 * Tracks the result of each subschema evaluated by a keyword and the instance
 * locations where it failed. This allows anyOf/oneOf alternatives to be
 * discriminated even when the instance as a whole is invalid.
 *
 * Whether a subschema failed because of the instance's type is tracked
 * separately because an object or array is discriminated by its type, not by
 * any other failure.
 *
 * State is keyed by context object rather than stored on the context so that
 * plugins using separate trackers don't share state.
 */
export class SubschemaTracker<T> {
  private failedLocations = new WeakMap<object, Set<string>>();
  private schemaFailures = new WeakMap<object, SchemaFailures>();
  private subschemaResults = new WeakMap<object, SubschemaResult<T>[]>();

  beforeSchema(context: object): void {
    if (!this.failedLocations.has(context)) {
      this.failedLocations.set(context, new Set());
    }
    this.schemaFailures.set(context, { failedLocations: new Set(), failedType: false });
  }

  beforeKeyword(keywordContext: object): void {
    this.subschemaResults.set(keywordContext, []);
  }

  afterKeyword(keywordId: string, keywordValue: unknown, instance: JsonNode, keywordContext: object, valid: boolean, schemaContext: object): void {
    if (!valid) {
      const schemaFailures = this.schemaFailures.get(schemaContext)!;
      schemaFailures.failedLocations.add(instance.pointer);
      for (const location of this.failedLocations.get(keywordContext) ?? []) {
        schemaFailures.failedLocations.add(location);
      }

      if (this.isTypeFailure(keywordId, keywordValue, instance)) {
        schemaFailures.failedType = true;
      }
    }
  }

  afterSchema(instance: JsonNode, context: object, valid: boolean, value: T): void {
    const schemaFailures = this.schemaFailures.get(context)!;
    if (!valid) {
      schemaFailures.failedLocations.add(instance.pointer);
    }

    const failedLocations = this.failedLocations.get(context)!;
    for (const location of schemaFailures.failedLocations) {
      failedLocations.add(location);
    }

    this.subschemaResults.get(context)?.push({
      value,
      failedLocations: schemaFailures.failedLocations,
      failedType: schemaFailures.failedType
    });
  }

  getSubschemaResults(keywordContext: object): SubschemaResult<T>[] {
    return this.subschemaResults.get(keywordContext) ?? [];
  }

  /**
   * Whether a failing keyword rules out the instance's type
   */
  private isTypeFailure(keywordId: string, keywordValue: unknown, instance: JsonNode): boolean {
    switch (keywordId) {
      case "https://json-schema.org/keyword/type":
        return true;

      case "https://json-schema.org/keyword/const":
        return jsonTypeOf(keywordValue as string) !== Instance.typeOf(instance);

      case "https://json-schema.org/keyword/enum":
        return (keywordValue as string[]).every((value) => jsonTypeOf(value) !== Instance.typeOf(instance));

      default:
        return false;
    }
  }

  /**
   * Drop alternatives that fail at a location where another alternative
   * passes. Locations where every alternative fails don't discriminate.
   * Alternatives that rule out the instance's type are dropped unless they all
   * do. An object or array is usually incomplete while it's being edited, so
   * other failures on it don't discriminate.
   */
  discriminate(alternatives: SubschemaResult<T>[], instance: JsonNode): T[] {
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

    const isTypeDiscriminating = alternatives.some((alternative) => !alternative.failedType);

    const passingAlternatives: T[] = [];
    for (const alternative of alternatives) {
      if (isTypeDiscriminating && alternative.failedType) {
        continue;
      }

      if (locations.some((pointer) => alternative.failedLocations.has(pointer) && passingLocations.has(pointer))) {
        continue;
      }

      passingAlternatives.push(alternative.value);
    }

    return passingAlternatives;
  }
}

// The type of a const or enum value, which is compiled to its JSON text
const jsonTypeOf = (json: string): string => {
  switch (json[0]) {
    case "{": return "object";
    case "[": return "array";
    case "\"": return "string";
    case "t":
    case "f": return "boolean";
    case "n": return "null";
    default: return "number";
  }
};
