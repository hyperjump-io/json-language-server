import { describe, test, expect, afterEach } from "vitest";
import { registerSchema, unregisterSchema } from "@hyperjump/json-schema/draft-2020-12";
import { compile, getSchema, interpret } from "@hyperjump/json-schema/experimental";
import * as Instance from "@hyperjump/json-schema/instance/experimental";
import { JSE } from "@hyperjump/json-schema-errors";
import { AnnotationsEvaluationPlugin } from "./AnnotationsEvaluationPlugin.ts";

import type { SchemaObject } from "@hyperjump/json-schema";
import type { Json } from "@hyperjump/json-schema-errors";
const schemaUri = "https://example.com/annotations-test";

const evaluate = async (schema: SchemaObject, instance: Json, incompleteLocations?: Set<string>) => {
  registerSchema(schema, schemaUri, "https://json-schema.org/draft/2020-12/schema");
  const compiledSchema = await compile(await getSchema(schemaUri));
  const plugin = new AnnotationsEvaluationPlugin(incompleteLocations);
  interpret(compiledSchema, Instance.fromJs(instance), { outputFormat: JSE, plugins: [plugin] });
  return plugin;
};

const titles = (annotations: Record<string, unknown>[]) => annotations.map((annotation) => annotation["https://json-schema.org/keyword/title"] as string | undefined).filter((title) => title !== undefined);
const descriptions = (annotations: Record<string, unknown>[]) => annotations.map((annotation) => annotation["https://json-schema.org/keyword/description"] as string | undefined).filter((description) => description !== undefined);

describe("AnnotationsEvaluationPlugin location and value annotations", () => {
  afterEach(() => {
    unregisterSchema(schemaUri);
  });

  test("a property's own annotations are location annotations", async () => {
    const plugin = await evaluate({
      properties: {
        foo: { title: "Foo" }
      }
    }, { foo: 42 });

    expect(titles(plugin.getLocationAnnotations("/foo"))).toEqual(["Foo"]);
    expect(titles(plugin.getValueAnnotations("/foo"))).toEqual([]);
  });

  test("a property's own annotations are location annotations even if its value is invalid", async () => {
    const plugin = await evaluate({
      properties: {
        foo: { type: "string", title: "Foo" }
      }
    }, { foo: 42 });

    expect(titles(plugin.getLocationAnnotations("/foo"))).toEqual(["Foo"]);
  });

  test("annotations through $ref and allOf are location annotations", async () => {
    const plugin = await evaluate({
      properties: {
        foo: { $ref: "#/$defs/foo" },
        bar: { allOf: [{ title: "Bar" }] }
      },
      $defs: {
        foo: { title: "Foo" }
      }
    }, { foo: 42, bar: 42 });

    expect(titles(plugin.getLocationAnnotations("/foo"))).toEqual(["Foo"]);
    expect(titles(plugin.getLocationAnnotations("/bar"))).toEqual(["Bar"]);
  });

  test("annotations through $dynamicRef are location annotations", async () => {
    const plugin = await evaluate({
      $dynamicAnchor: "foo",
      properties: {
        foo: { $dynamicRef: "#foo" }
      },
      title: "Foo"
    }, { foo: {} });

    expect(titles(plugin.getLocationAnnotations("/foo"))).toEqual(["Foo"]);
  });

  test("annotations of an anyOf alternative are value annotations", async () => {
    const plugin = await evaluate({
      properties: {
        color: {
          anyOf: [
            { const: "red", title: "Red" },
            { enum: ["green", "blue"] }
          ]
        }
      }
    }, { color: "red" });

    expect(titles(plugin.getLocationAnnotations("/color"))).toEqual([]);
    expect(titles(plugin.getValueAnnotations("/color"))).toEqual(["Red"]);
  });

  test("annotations of an alternative that is discriminated out don't apply", async () => {
    const plugin = await evaluate({
      properties: {
        color: {
          anyOf: [
            { const: "red", title: "Red" },
            { enum: ["green", "blue"] }
          ]
        }
      }
    }, { color: "green" });

    expect(titles(plugin.getLocationAnnotations("/color"))).toEqual([]);
    expect(titles(plugin.getValueAnnotations("/color"))).toEqual([]);
  });

  test("annotations of a then are value annotations", async () => {
    const plugin = await evaluate({
      properties: {
        foo: {
          if: { type: "string" },
          then: { title: "String foo" }
        }
      }
    }, { foo: "a" });

    expect(titles(plugin.getLocationAnnotations("/foo"))).toEqual([]);
    expect(titles(plugin.getValueAnnotations("/foo"))).toEqual(["String foo"]);
  });

  test("annotations that depend on a sibling are location annotations", async () => {
    const plugin = await evaluate({
      if: {
        properties: { version: { const: 1 } }
      },
      then: {
        properties: { foo: { title: "Foo" } }
      }
    }, { version: 1, foo: 42 });

    expect(titles(plugin.getLocationAnnotations("/foo"))).toEqual(["Foo"]);
    expect(titles(plugin.getValueAnnotations("/foo"))).toEqual([]);
  });

  test("annotations of an item are location annotations", async () => {
    const plugin = await evaluate({
      prefixItems: [{ title: "First" }],
      items: { anyOf: [{ const: 1, title: "One" }, { const: 2 }] }
    }, ["a", 1, 2]);

    expect(titles(plugin.getLocationAnnotations("/0"))).toEqual(["First"]);
    expect(titles(plugin.getValueAnnotations("/1"))).toEqual(["One"]);
    expect(titles(plugin.getValueAnnotations("/2"))).toEqual([]);
  });

  test("an incomplete location has the location annotations of its property", async () => {
    const plugin = await evaluate({
      properties: {
        foo: { $ref: "#/$defs/foo" },
        bar: { anyOf: [{ const: "a", title: "A" }, { const: "b" }] }
      },
      $defs: {
        foo: { allOf: [{ title: "Foo" }] }
      }
    }, {}, new Set(["/foo", "/bar"]));

    expect(titles(plugin.getLocationAnnotations("/foo"))).toEqual(["Foo"]);
    expect(titles(plugin.getLocationAnnotations("/bar"))).toEqual([]);
  });

  test("descriptions are split into location and value annotations", async () => {
    const plugin = await evaluate({
      properties: {
        color: {
          description: "The color",
          anyOf: [
            { const: "red", description: "Legacy red" },
            { const: "green" }
          ]
        }
      }
    }, { color: "red" });

    expect(descriptions(plugin.getLocationAnnotations("/color"))).toContain("The color");
    expect(descriptions(plugin.getValueAnnotations("/color"))).toEqual(["Legacy red"]);
  });

  test("annotations under not don't apply", async () => {
    const plugin = await evaluate({
      properties: {
        color: {
          not: { const: "green", title: "Green" }
        }
      }
    }, { color: "red" });

    expect(titles(plugin.getLocationAnnotations("/color"))).toEqual([]);
    expect(titles(plugin.getValueAnnotations("/color"))).toEqual([]);
  });

  test("annotations of a property in an alternative of its parent are location annotations", async () => {
    const plugin = await evaluate({
      anyOf: [
        { properties: { kind: { const: "a" }, foo: { title: "Foo" } } },
        { properties: { kind: { const: "b" } } }
      ]
    }, { kind: "a", foo: 42 });

    expect(titles(plugin.getLocationAnnotations("/foo"))).toEqual(["Foo"]);
    expect(titles(plugin.getValueAnnotations("/foo"))).toEqual([]);
  });
});
