import * as Instance from "@hyperjump/json-schema/instance/experimental";

import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";

export type SubschemaResult<T> = {
  value: T;
  pointer: string;
  failedLocations: Set<string>;
  failedType: boolean;
};

type SchemaFailures = {
  failedLocations: Set<string>;
  failedType: boolean;
};

type TrackerState<T> = {
  failedLocations?: Set<string>;
  schemaFailures?: SchemaFailures;
  subschemaResults?: SubschemaResult<T>[];
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
 * State is stored on the context under a key that's unique to the tracker so
 * that plugins using separate trackers don't share state. A property is much
 * faster than a WeakMap for something that happens for every keyword.
 */
export class SubschemaTracker<T> {
  private key = Symbol("SubschemaTracker");

  private state(context: object): TrackerState<T> {
    return (context as Record<symbol, TrackerState<T>>)[this.key] ??= {};
  }

  beforeSchema(context: object): void {
    const state = this.state(context);
    state.failedLocations ??= new Set();
    state.schemaFailures = { failedLocations: new Set(), failedType: false };
  }

  beforeKeyword(keywordContext: object): void {
    this.state(keywordContext).subschemaResults = [];
  }

  afterKeyword(keywordId: string, keywordValue: unknown, instance: JsonNode, keywordContext: object, valid: boolean, schemaContext: object): void {
    if (!valid) {
      const schemaFailures = this.state(schemaContext).schemaFailures!;
      schemaFailures.failedLocations.add(instance.pointer);
      for (const location of this.state(keywordContext).failedLocations ?? []) {
        schemaFailures.failedLocations.add(location);
      }

      if (this.isTypeFailure(keywordId, keywordValue, instance, keywordContext)) {
        schemaFailures.failedType = true;
      }
    }
  }

  afterSchema(instance: JsonNode, context: object, valid: boolean, value: T): void {
    const state = this.state(context);
    const schemaFailures = state.schemaFailures!;
    if (!valid) {
      // A schema that fails without any of its keywords failing is a `false`
      // schema, which rules out every type
      if (schemaFailures.failedLocations.size === 0) {
        schemaFailures.failedType = true;
      }
      schemaFailures.failedLocations.add(instance.pointer);
    }

    const failedLocations = state.failedLocations!;
    for (const location of schemaFailures.failedLocations) {
      failedLocations.add(location);
    }

    state.subschemaResults?.push({
      value,
      pointer: instance.pointer,
      failedLocations: schemaFailures.failedLocations,
      failedType: schemaFailures.failedType
    });
  }

  getSubschemaResults(keywordContext: object): SubschemaResult<T>[] {
    return this.state(keywordContext).subschemaResults ?? [];
  }

  /**
   * Whether a failing keyword rules out the instance's type. A subschema that
   * applies to the same instance location fails type if it rules out the
   * instance's type, but an anyOf/oneOf only does if all of its alternatives
   * do.
   */
  private isTypeFailure(keywordId: string, keywordValue: unknown, instance: JsonNode, keywordContext: object): boolean {
    switch (keywordId) {
      case "https://json-schema.org/keyword/type":
        return true;

      case "https://json-schema.org/keyword/const":
        return jsonTypeOf(keywordValue as string) !== Instance.typeOf(instance);

      case "https://json-schema.org/keyword/enum":
        return (keywordValue as string[]).every((value) => jsonTypeOf(value) !== Instance.typeOf(instance));

      case "https://json-schema.org/keyword/anyOf":
      case "https://json-schema.org/keyword/oneOf":
        return this.getSubschemaResults(keywordContext).every((result) => result.failedType);

      default:
        return this.getSubschemaResults(keywordContext)
          .some((result) => result.pointer === instance.pointer && result.failedType);
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
