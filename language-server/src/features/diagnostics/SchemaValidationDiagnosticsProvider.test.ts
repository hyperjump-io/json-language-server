import { describe, test, expect, afterEach, beforeEach } from "vitest";
import { PublishDiagnosticsNotification } from "vscode-languageserver";
import { TestClient } from "../../test/TestClient.ts";

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

  test("JSON Validation using Hyperjump - Valid Case", async () => {
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
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });

  test("JSON Validation using Hyperjump - Invalid Case", async () => {
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
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068string\u2069" }),
      expect.objectContaining({ message: "Expected a \u2068number\u2069" })
    ]);
  });

  test("schema validation is not skipped even if the JSON is invalid", async () => {
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
      "name": "Alice"
      "age" : "not a number"
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "comma-expected" }),
      expect.objectContaining({ message: "Expected a \u2068number\u2069" })
    ]);
  });

  test("JSON Validation using Hyperjump - anyOf Formatting Case", async () => {
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
    const diagnostics = client.getDiagnostics("instance.json");
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
    const diagnostics = client.getDiagnostics("instance.json");
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
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068string\u2069" })
    ]);
  });

  test("property key that looks like a number should not be treated like one - object case", async () => {
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
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068string\u2069" })
    ]);
  });

  test("URI encoded characters in pointer are decoded correctly", async () => {
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
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068string\u2069" })
    ]);
  });

  test("numeric segment in array should be treated as array index", async () => {
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
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068number\u2069" })
    ]);
  });

  test("after fixing schema validation errors, it should not return a diagnostic", async () => {
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
    const initialValidation = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(initialValidation).resolves.toHaveLength(1);

    const secondValidation = client.getDiagnostics("instance.json");
    await client.changeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice",
      "age" : 39
    }`);

    await expect(secondValidation).resolves.toHaveLength(0);
  });

  test("changing the schema should invalidate the cache", async () => {
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
    const initialValidation = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(initialValidation).resolves.toHaveLength(1);

    const secondValidation = client.getDiagnostics("instance.json");
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
    const initialValidation = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(initialValidation).resolves.toHaveLength(1);

    const secondValidation = client.getDiagnostics("instance.json");
    await client.writeDocument("B.schema.json", `{
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "string"
    }`);

    await expect(secondValidation).resolves.toHaveLength(0);
  });

  test("JSON Validation using Hyperjump - Relative $schema case", async () => {
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
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a \u2068string\u2069" })
    ]);
  });

  test("changing a watched file should not revalidate documents with no $schema", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object"
    }`);

    await client.writeDocument("plain.json", `{ "foo": "bar" }`);
    const plainValidation = client.getDiagnostics("plain.json");
    const plainUri = await client.openDocument("plain.json");
    await plainValidation;

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}"
    }`);
    const instanceValidation = client.getDiagnostics("instance.json");
    const instanceUri = await client.openDocument("instance.json");
    await instanceValidation;

    let plainRevalidated = false;
    const instanceRevalidated = new Promise<void>((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === plainUri) {
          plainRevalidated = true;
        } else if (params.uri === instanceUri) {
          resolve();
        }
      });
    });

    await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "array"
    }`);
    await instanceRevalidated;

    expect(plainRevalidated).toBe(false);
  });

  test("A JSON syntax error should reset the schema errors", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": 42
    }`);

    // Inital validation has a schema error
    const initialValidation = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialValidation).resolves.to.toHaveLength(1);

    // Introduce syntax error
    const secondValidation = client.getDiagnostics("instance.json");
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

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": 42
    }`);

    // Inital validation has a schema error
    const initialValidation = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialValidation).resolves.to.toHaveLength(1);

    // Remove $schema
    const secondValidation = client.getDiagnostics("instance.json");
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

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": 42
    }`);

    // Inital validation has a schema error
    const initialValidation = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialValidation).resolves.to.toHaveLength(1);

    // Introducing a schema error should reset schema errors on dependent instances
    const secondValidation = client.getDiagnostics("instance.json");
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
    await client.writeDocument("instance.json", `{
      "$schema": "schema.json",
      "foo": 42
    }`);

    const initialDiagnostics = client.getDiagnostics("instance.json");
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

    const secondDiagnostics = client.getDiagnostics("instance.json");
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
    const diagnostics = client.getDiagnostics("instance.json");
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
    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice",
      "age": 42
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
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

  test("should register self-identifying schema and validate document using its $id", async () => {
    const schemaId = "https://example.com/my-workspace-schema";

    // 1. Create a self-identifying schema file in the workspace
    await client.writeDocument("my-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "foo": { "type": "string" }
      }
    }`);

    // 2. Create and open an instance file that references the local schema by its $id
    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      {
        message: "Expected a ⁨string⁩",
        range: {
          start: { line: 2, character: 13 },
          end: { line: 2, character: 15 }
        },
        severity: 1,
        source: "hyperjump-json-language-server"
      }
    ]);
  });

  test("should update registered schema and re-validate dependent documents", async () => {
    const schemaId = "https://example.com/my-workspace-schema";

    // 1. Create initial schema
    await client.writeDocument("my-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "foo": { "type": "string" }
      }
    }`);

    // 2. Create instance and resolve initial validation
    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    const initialValidation = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(initialValidation).resolves.toEqual([
      {
        message: "Expected a ⁨string⁩",
        range: {
          start: { line: 2, character: 13 },
          end: { line: 2, character: 15 }
        },
        severity: 1,
        source: "hyperjump-json-language-server"
      }
    ]);

    // 3. Update the schema to allow a number for "foo"

    const updatedDiagnostics = client.getDiagnostics("instance.json");
    await client.writeDocument("my-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "foo": { "type": "number" }
      }
    }`);

    await expect(updatedDiagnostics).resolves.toEqual([]);
  });

  test("should unregister schema when schema file is deleted", async () => {
    const schemaId = "https://example.com/my-workspace-schema";

    // 1. Create schema and wait for it to be registered on the server
    await client.writeDocument("delete-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "baz": { "type": "boolean" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "baz": "true"
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      {
        message: "Expected a ⁨boolean⁩",
        range: {
          start: { line: 2, character: 13 },
          end: { line: 2, character: 19 }
        },
        severity: 1,
        source: "hyperjump-json-language-server"
      }
    ]);

    // 2. Delete the schema file and wait for unregistration to complete on the server
    const updatedDiagnostics = client.getDiagnostics("instance.json");
    await client.deleteDocument("delete-schema.json");

    // 3. Try to validate an instance against the deleted schema (should fail to load schema)
    await expect(updatedDiagnostics).resolves.toEqual([
      {
        message: `Unable to load resource '${schemaId}'.`,
        range: {
          start: { line: 1, character: 17 },
          end: { line: 1, character: 58 }
        },
        severity: 1,
        source: "hyperjump-json-language-server"
      }
    ]);
  });

  test("should unregister the old $id when a schema's $id changes", async () => {
    const oldSchemaId = "https://example.com/old-schema";
    const newSchemaId = "https://example.com/new-schema";

    await client.writeDocument("my-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${oldSchemaId}",
      "type": "object"
    }`);
    const schemaValidation = client.getDiagnostics("my-schema.json");
    await client.openDocument("my-schema.json");
    await schemaValidation;

    await client.writeDocument("my-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${newSchemaId}",
      "type": "object"
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${oldSchemaId}"
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: `Unable to load resource '${oldSchemaId}'.` })
    ]);
  });

  test("should unregister schema when a schema file that was never used is deleted", async () => {
    const schemaId = "https://example.com/my-workspace-schema";

    await client.writeDocument("delete-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object"
    }`);
    const schemaValidation = client.getDiagnostics("delete-schema.json");
    await client.openDocument("delete-schema.json");
    await schemaValidation;

    await client.deleteDocument("delete-schema.json");

    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}"
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: `Unable to load resource '${schemaId}'.` })
    ]);
  });

  test("should keep a registered schema when a schema it depends on changes", async () => {
    const mainSchemaId = "https://example.com/main-schema";
    const refSchemaId = "https://example.com/ref-schema";

    await client.writeDocument("main-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${mainSchemaId}",
      "$ref": "${refSchemaId}"
    }`);
    await client.writeDocument("ref-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${refSchemaId}",
      "type": "string"
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${mainSchemaId}"
    }`);
    const initialValidation = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(initialValidation).resolves.toEqual([
      expect.objectContaining({ message: "Expected a ⁨string⁩" })
    ]);

    const updatedDiagnostics = client.getDiagnostics("instance.json");
    await client.writeDocument("ref-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${refSchemaId}",
      "type": "object"
    }`);

    await expect(updatedDiagnostics).resolves.toEqual([]);
  });

  test("should keep a schema registered when a file with a duplicate $id is deleted", async () => {
    const schemaId = "https://example.com/duplicate-schema";

    await client.writeDocument("a-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "foo": { "type": "string" }
      }
    }`);
    const aValidation = client.getDiagnostics("a-schema.json");
    await client.openDocument("a-schema.json");
    await aValidation;

    // Fails to register because a-schema.json already registered the $id
    await client.writeDocument("b-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "foo": { "type": "number" }
      }
    }`);
    const bValidation = client.getDiagnostics("b-schema.json");
    await client.openDocument("b-schema.json");
    await bValidation;

    await client.deleteDocument("b-schema.json");

    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a ⁨string⁩" })
    ]);
  });

  test("should revalidate dependent documents when a schema whose $id has an empty fragment changes", async () => {
    const schemaId = "https://example.com/draft-07-schema";

    await client.writeDocument("my-schema.json", `{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "$id": "${schemaId}#",
      "type": "object",
      "properties": {
        "foo": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    const initialValidation = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(initialValidation).resolves.toEqual([
      expect.objectContaining({ message: "Expected a ⁨string⁩" })
    ]);

    const updatedDiagnostics = client.getDiagnostics("instance.json");
    await client.writeDocument("my-schema.json", `{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "$id": "${schemaId}#",
      "type": "object",
      "properties": {
        "foo": { "type": "number" }
      }
    }`);

    await expect(updatedDiagnostics).resolves.toEqual([]);
  });
});

describe("Workspace scan", async () => {
  let client: TestClient | undefined;

  afterEach(async () => {
    await client?.stop();
  });

  test("should discover and register self-identifying schemas on startup", async () => {
    const schemaId = "https://example.com/my-workspace-schema";

    client = new TestClient();
    await client.writeDocument("startup-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "bar": { "type": "number" }
      }
    }`);
    await client.start();

    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "bar": "not a number"
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      {
        message: "Expected a ⁨number⁩",
        range: {
          start: { line: 2, character: 13 },
          end: { line: 2, character: 27 }
        },
        severity: 1,
        source: "hyperjump-json-language-server"
      }
    ]);
  });

  test("should handle invalid schema during scan and register valid ones successfully", async () => {
    const validSchemaId = "https://example.com/my-valid-schema";

    client = new TestClient();

    // Write a schema with an invalid/unsupported dialect that will throw an error
    await client.writeDocument("startup-broken-schema.json", `{
      "$schema": "https://example.com/invalid-dialect",
      "$id": "https://example.com/broken",
      "type": "object"
    }`);

    // Write a valid schema
    await client.writeDocument("startup-valid-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${validSchemaId}",
      "type": "object",
      "properties": {
        "bar": { "type": "number" }
      }
    }`);

    await client.start();

    // Verify the server is still running and the valid schema works as expected
    await client.writeDocument("instance.json", `{
      "$schema": "${validSchemaId}",
      "bar": "not a number"
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      {
        message: "Expected a ⁨number⁩",
        range: {
          start: { line: 2, character: 13 },
          end: { line: 2, character: 27 }
        },
        severity: 1,
        source: "hyperjump-json-language-server"
      }
    ]);
  });
});
