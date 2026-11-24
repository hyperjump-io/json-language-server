import { interpret } from "@hyperjump/json-schema/experimental";
import * as Instance from "@hyperjump/json-schema/instance/experimental";
import { JsonSchemaAnnotation } from "./JsonSchemaAnnotation.ts";
import { VscodeAnnotation } from "./VscodeAnnotation.ts";

import type { Json } from "@hyperjump/json-pointer";
import type { AST } from "@hyperjump/json-schema/experimental";

// The annotations one schema contributed to an instance location, keyed by
// keyword URI
export type AnnotationRecord = Record<string, unknown>;

// Vocabularies add accessors for the annotations of their keywords by
// extending BaseAnnotation with a mixin. The mixins are composed into the
// Annotation class below.
export type Constructor<T> = new (...args: any[]) => T;

export class BaseAnnotation {
  protected keywords: AnnotationRecord;

  constructor(keywords: AnnotationRecord) {
    this.keywords = keywords;
  }

  // Keywords a dialect doesn't define produce annotations as unknown keywords,
  // which aren't checked against a meta-schema, so their values could be
  // anything. An accessor that reads an unknown keyword as a keyword it knows
  // uses this to ignore values that aren't valid against that keyword's schema.
  // Undefined if the keyword isn't present or its value isn't valid.
  protected unknownKeyword(keyword: string, schemaUri: string, ast: AST) {
    let validated = validatedUnknownKeywords.get(this.keywords);
    if (!validated) {
      validated = new Map();
      validatedUnknownKeywords.set(this.keywords, validated);
    }

    if (!validated.has(keyword)) {
      const value = this.keywords[`https://json-schema.org/keyword/unknown#${keyword}`] as Json | undefined;
      const isValid = value === undefined || interpret({ schemaUri, ast }, Instance.fromJs(value)).valid;
      validated.set(keyword, isValid ? value : undefined);
    }

    return validated.get(keyword);
  }
}

// An accessor can be called for every completion at a location, and
// Annotation objects are created every time annotations are read, so the
// validated value of an unknown keyword is kept per record
const validatedUnknownKeywords = new WeakMap<AnnotationRecord, Map<string, Json | undefined>>();

// The annotations one schema contributed to an instance location, with the
// accessors of every vocabulary. A vocabulary's mixin overrides the accessors of
// the ones it's applied to, so their order matters.
export class Annotation extends VscodeAnnotation(JsonSchemaAnnotation(BaseAnnotation)) {}
