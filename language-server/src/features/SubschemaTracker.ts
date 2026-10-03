import * as Instance from "@hyperjump/json-schema/instance/experimental";

import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";

export type SubschemaResult<T> = {
  value: T;
  failedLocations: Set<string>;
};

/**
 * Tracks the result of each subschema evaluated by a keyword and the instance
 * locations where it failed. This allows anyOf/oneOf alternatives to be
 * discriminated even when the instance as a whole is invalid.
 *
 * State is keyed by context object rather than stored on the context so that
 * plugins using separate trackers don't share state.
 */
export class SubschemaTracker<T> {
  private failedLocations = new WeakMap<object, Set<string>>();
  private schemaFailedLocations = new WeakMap<object, Set<string>>();
  private subschemaResults = new WeakMap<object, SubschemaResult<T>[]>();

  beforeSchema(context: object): void {
    if (!this.failedLocations.has(context)) {
      this.failedLocations.set(context, new Set());
    }
    this.schemaFailedLocations.set(context, new Set());
  }

  beforeKeyword(keywordContext: object): void {
    this.subschemaResults.set(keywordContext, []);
  }

  afterKeyword(instance: JsonNode, keywordContext: object, valid: boolean, schemaContext: object): void {
    if (!valid) {
      const schemaFailedLocations = this.schemaFailedLocations.get(schemaContext)!;
      schemaFailedLocations.add(instance.pointer);
      for (const location of this.failedLocations.get(keywordContext) ?? []) {
        schemaFailedLocations.add(location);
      }
    }
  }

  afterSchema(instance: JsonNode, context: object, valid: boolean, value: T): void {
    const schemaFailedLocations = this.schemaFailedLocations.get(context)!;
    if (!valid) {
      schemaFailedLocations.add(instance.pointer);
    }

    const failedLocations = this.failedLocations.get(context)!;
    for (const location of schemaFailedLocations) {
      failedLocations.add(location);
    }

    this.subschemaResults.get(context)?.push({ value, failedLocations: schemaFailedLocations });
  }

  getSubschemaResults(keywordContext: object): SubschemaResult<T>[] {
    return this.subschemaResults.get(keywordContext) ?? [];
  }

  /**
   * Drop alternatives that fail at a location where another alternative
   * passes. Locations where every alternative fails don't discriminate.
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

    const passingAlternatives: T[] = [];
    for (const alternative of alternatives) {
      if (locations.some((pointer) => alternative.failedLocations.has(pointer) && passingLocations.has(pointer))) {
        continue;
      }

      passingAlternatives.push(alternative.value);
    }

    return passingAlternatives;
  }
}
