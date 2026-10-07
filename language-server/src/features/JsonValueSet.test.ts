import { describe, test, expect } from "vitest";
import { JsonValueSet } from "./JsonValueSet.ts";

import type { AnnotationRecord } from "../annotations/JsonSchemaAnnotation.ts";

const a: AnnotationRecord = { a: true };
const b: AnnotationRecord = { b: true };

const strings = () => new JsonValueSet().addType("string");
const values = (...values: string[]) => values.reduce((set, value) => set.addValue(JSON.stringify(value)), new JsonValueSet());
const annotationsOf = (set: JsonValueSet, value: string) => set.getValueAnnotations(JSON.stringify(value));
const typeAnnotations = (set: JsonValueSet) => Object.fromEntries([...set].flatMap((entry) => entry.kind === "type" ? [[entry.type, entry.annotations]] : []));

// An annotated set that is one alternative for the value
const alternative = (set: JsonValueSet, annotation: AnnotationRecord) => set.annotate(annotation).withMemberAnnotations();

describe("JsonValueSet annotations", () => {
  test("location annotations aren't member annotations", () => {
    const set = values("red").annotate(a);

    expect(annotationsOf(set, "red")).toEqual([]);
  });

  test("withMemberAnnotations makes location annotations member annotations", () => {
    const set = alternative(values("red"), a);

    expect(annotationsOf(set, "red")).toEqual([a]);
  });

  test("withMemberAnnotations annotates a type", () => {
    const set = alternative(strings(), a);

    expect(typeAnnotations(set)).toEqual({ string: [a] });
    expect(annotationsOf(set, "anything")).toEqual([a]);
  });

  test("intersect keeps location annotations from both sets", () => {
    const set = values("red")
      .annotate(a)
      .intersect(values("red").annotate(b));

    expect(annotationsOf(set, "red")).toEqual([]);
    expect(annotationsOf(set.withMemberAnnotations(), "red")).toEqual([a, b]);
  });

  test("intersect of a value and an annotated type keeps the type's annotations", () => {
    const set = values("red").intersect(alternative(strings(), a));

    expect(annotationsOf(set, "red")).toEqual([a]);
  });

  test("union keeps location annotations at the location", () => {
    const set = values("red")
      .annotate(a)
      .union(values("green"));

    expect(annotationsOf(set, "green")).toEqual([]);
    expect(annotationsOf(set.withMemberAnnotations(), "green")).toEqual([a]);
  });

  test("union of alternatives keeps member annotations only for that alternative's members", () => {
    const set = alternative(values("red"), a).union(values("green"));

    expect(annotationsOf(set, "red")).toEqual([a]);
    expect(annotationsOf(set, "green")).toEqual([]);
  });

  test("union of a value and a type that admits it keeps the annotations of both", () => {
    const set = alternative(values("red"), a).union(alternative(strings(), b));

    expect(annotationsOf(set, "red")).toEqual([a, b]);
    expect(annotationsOf(set, "green")).toEqual([b]);
  });

  test("union of types keeps annotations only from the types that admit a value", () => {
    const stringsExceptX = strings().deleteValue(`"x"`);
    const set = alternative(strings(), a).union(alternative(stringsExceptX, b));

    expect(annotationsOf(set, "y")).toEqual([a, b]);
    expect(annotationsOf(set, "x")).toEqual([a]);
  });

  test("exclusiveUnion keeps annotations from the one set that admits a value", () => {
    const set = JsonValueSet.exclusiveUnion([alternative(values("red"), a), alternative(strings(), b)]);

    expect(set.hasValue(`"red"`)).toBe(false);
    expect(annotationsOf(set, "green")).toEqual([b]);
  });

  test("exclusiveUnion keeps location annotations at the location", () => {
    const set = JsonValueSet.exclusiveUnion([values("red").annotate(a), values("green")]);

    expect(annotationsOf(set, "green")).toEqual([]);
    expect(annotationsOf(set.withMemberAnnotations(), "green")).toEqual([a]);
  });

  test("complement drops annotations", () => {
    const set = alternative(values("red"), a).complement();

    expect(annotationsOf(set, "green")).toEqual([]);
    expect(annotationsOf(set.withMemberAnnotations(), "green")).toEqual([]);
    expect(Object.values(typeAnnotations(set)).flat()).toEqual([]);
  });
});
