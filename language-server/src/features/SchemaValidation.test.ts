import { describe, test, expect, afterEach, beforeEach } from "vitest";
import { PublishDiagnosticsNotification } from "vscode-languageserver";
import { TestClient } from "../test/TestClient.ts";
import { unregisterSchema } from "@hyperjump/json-schema";

import type { Diagnostic } from "vscode-languageserver";

describe("Schema Validation", () => {
  let client: TestClient;
  let fixtureSchemaUri: string;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  afterEach(() => {
    unregisterSchema(fixtureSchemaUri);
  });

  test("JSON Validation using Hyperjump - Valid Case", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice",
      "age" : 39
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });

  test("JSON Validation using Hyperjump - Invalid Case", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": 1234,
      "age" : "hello"
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068string\u2069" }),
      expect.objectContaining({ message: "Expected a \u2068number\u2069" })
    ]);
  });

  test("schema validation is skipped if the JSON is invalid", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name" 42,
      "age" : "not a number"
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("JSON Validation using Hyperjump - anyOf Formatting Case", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "anyOf": [
            { "type": "string" },
            { "type": "number" }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": true
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({
        message: `Expected the value to match at least one alternative:
  - Expected a \u2068string\u2069
  - Expected a \u2068number\u2069`
      })
    ]);
  });

  test("JSON Validation using Hyperjump - oneOf Formatting Case", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "oneOf": [
            { "type": "string" },
            { "type": "number" }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": true
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({
        message: `Expected the value to match exactly one alternative, \u2068but none\u2069 matched:
  - Expected a \u2068string\u2069
  - Expected a \u2068number\u2069`
      })
    ]);
  });

  test("JSON Validation using Hyperjump - property name with slash (escape sequence)", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "foo/bar": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo/bar": 11
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068string\u2069" })
    ]);
  });

  test("property key that looks like a number should not be treated like one - object case", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "0": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "0": 123
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068string\u2069" })
    ]);
  });

  test("URI encoded characters in pointer are decoded correctly", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "foo bar": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo bar": 123
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068string\u2069" })
    ]);
  });

  test("numeric segment in array should be treated as array index", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "42": {
          "type": "array",
          "items": { "type": "number" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "42": ["foo"]
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068number\u2069" })
    ]);
  });

  test("after fixing schema validation errors, it should not return a diagnostic", async () => {
    const initialValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice",
      "age" : "not a number"
    }`);
    await client.openDocument("instance.json");

    await expect(initialValidation).resolves.toHaveLength(1);

    const secondValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    await client.changeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice",
      "age" : 39
    }`);

    await expect(secondValidation).resolves.toHaveLength(0);
  });

  test("changing the schema should invalidate the cache", async () => {
    const initialValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice",
      "age" : "not a number"
    }`);
    const instanceUri = await client.openDocument("instance.json");

    await expect(initialValidation).resolves.toHaveLength(1);

    const secondValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === instanceUri) {
          resolve(params.diagnostics);
        }
      });
    });

    await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "string" }
      }
    }`);

    await expect(secondValidation).resolves.toHaveLength(0);
  });

  test("changing a referenced schema revalidates dependents", async () => {
    const initialValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    const referencedSchema = await client.writeDocument("B.schema.json", `{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "number"
    }`);

    fixtureSchemaUri = await client.writeDocument("A.schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "age": { "$ref": "${referencedSchema}" }
      }
    }`);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "age": "not a number"
    }`);
    const instanceUri = await client.openDocument("instance.json");

    await expect(initialValidation).resolves.toHaveLength(1);

    const secondValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === instanceUri) {
          resolve(params.diagnostics);
        }
      });
    });

    await client.writeDocument("B.schema.json", `{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "string"
    }`);

    await expect(secondValidation).resolves.toHaveLength(0);
  });

  test("JSON Validation using Hyperjump - Relative $schema case", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "schema.json",
      "name": 1234
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068string\u2069" })
    ]);
  });

  test("changing a watched file should not revalidate documents with no $schema", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("plain.json", `{ "foo": "bar" }`);
    const plainUri = await client.openDocument("plain.json");
    await diagnostics;

    let revalidated = false;
    client.onNotification(PublishDiagnosticsNotification.type, (params) => {
      if (params.uri === plainUri) {
        revalidated = true;
      }
    });

    fixtureSchemaUri = await client.writeDocument("unrelated.schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object"
    }`);

    expect(revalidated).toBe(false);
  });

  test("A JSON syntax error should reset the schema errors", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      }
    }`);

    const instanceUri = await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": 42
    }`);

    // Inital validation has a schema error
    const initialValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === instanceUri) {
          resolve(params.diagnostics);
        }
      });
    });
    await client.openDocument("instance.json");
    await expect(initialValidation).resolves.to.toHaveLength(1);

    // Introduce syntax error
    const secondValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === instanceUri) {
          resolve(params.diagnostics);
        }
      });
    });
    await client.changeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo" "bar"
    }`);
    await expect(secondValidation).resolves.to.toHaveLength(1);
  });

  test("Removing $schema should reset schema errors", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      }
    }`);

    const instanceUri = await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": 42
    }`);

    // Inital validation has a schema error
    const initialValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === instanceUri) {
          resolve(params.diagnostics);
        }
      });
    });
    await client.openDocument("instance.json");
    await expect(initialValidation).resolves.to.toHaveLength(1);

    // Remove $schema
    const secondValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === instanceUri) {
          resolve(params.diagnostics);
        }
      });
    });
    await client.changeDocument("instance.json", `{
      "foo": "bar"
    }`);
    await expect(secondValidation).resolves.to.toHaveLength(0);
  });

  test("Introducing a schema error should reset schemas errors for dependent instances", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      }
    }`);

    const instanceUri = await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": 42
    }`);

    // Inital validation has a schema error
    const initialValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === instanceUri) {
          resolve(params.diagnostics);
        }
      });
    });
    await client.openDocument("instance.json");
    await expect(initialValidation).resolves.to.toHaveLength(1);

    // Introducing a schema error should reset schema errors on dependent instances
    const secondValidation: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === instanceUri) {
          resolve(params.diagnostics);
        }
      });
    });
    await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "invalid-type" }
      }
    }`);
    await expect(secondValidation).resolves.toEqual([
      {
        message: "Invalid Schema",
        range: {
          start: { line: 1, character: 17 },
          end: { line: 1, character: 17 + fixtureSchemaUri.length + 2 }
        },
        severity: 1,
        source: "hyperjump-json-language-server"
      }
    ]);
  });

  test("Fixing a schema error should reset schemas errors for dependent instances", async () => {
    // Start with an invalid schema
    await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "foo": { "type": "invalid" }
      }
    }`);

    // Open a document that uses the invalid schema
    const instanceUri = await client.writeDocument("instance.json", `{
      "$schema": "schema.json",
      "foo": 42
    }`);

    const initialDiagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === instanceUri) {
          resolve(params.diagnostics);
        }
      });
    });

    await client.openDocument("instance.json");

    // Confirm invlaid schema message
    await expect(initialDiagnostics).resolves.toEqual([
      {
        message: "Invalid Schema",
        range: {
          start: { line: 1, character: 17 },
          end: { line: 1, character: 30 }
        },
        severity: 1,
        source: "hyperjump-json-language-server"
      }
    ]);

    // Make the schema valid
    const secondDiagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === instanceUri) {
          resolve(params.diagnostics);
        }
      });
    });

    await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "foo": { "type": "number" }
      }
    }`);

    // Confirm valid
    await expect(secondDiagnostics).resolves.toEqual([]);
  });

  test("$schema points to an invalid schema", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "invalid" },
        "age": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice",
      "age": 42
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      {
        message: "Invalid Schema",
        range: {
          start: { line: 1, character: 17 },
          end: { line: 1, character: 17 + fixtureSchemaUri.length + 2 }
        },
        severity: 1,
        source: "hyperjump-json-language-server"
      }
    ]);
  });

  test("$schema points to a schema that doesn't exist", async () => {
    const diagnostics: Promise<Diagnostic[]> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice",
      "age": 42
    }`);
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      {
        message: `Unable to load resource '${fixtureSchemaUri}'.`,
        range: {
          start: { line: 1, character: 17 },
          end: { line: 1, character: 17 + fixtureSchemaUri.length + 2 }
        },
        severity: 1,
        source: "hyperjump-json-language-server"
      }
    ]);
  });
});
