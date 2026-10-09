import { describe, test, expect, afterEach, beforeEach } from "vitest";
import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver";
import { TestClient } from "../../test/TestClient.ts";

describe("Deprecated Diagnostics", () => {
  let client: TestClient;
  let fixtureSchemaUri: string;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("a deprecated property is reported on its key with the deprecationMessage", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "deprecationMessage": "Use fullName instead."
        },
        "fullName": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice",
      "fullName": "Alice Smith"
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      {
        severity: DiagnosticSeverity.Warning,
        tags: [DiagnosticTag.Deprecated],
        range: {
          start: { line: 2, character: 6 },
          end: { line: 2, character: 12 }
        },
        message: "Use fullName instead.",
        source: "hyperjump-json-language-server"
      }
    ]);
  });

  test("the deprecated keyword uses a default message", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "deprecated": true
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice"
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({
        tags: [DiagnosticTag.Deprecated],
        message: "Deprecated"
      })
    ]);
  });

  test("a deprecated property is reported on its key even if it doesn't have a value", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "deprecated": true
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    // The missing value is also reported as a syntax error
    await expect(diagnostics).resolves.toContainEqual(
      expect.objectContaining({
        tags: [DiagnosticTag.Deprecated],
        range: {
          start: { line: 2, character: 6 },
          end: { line: 2, character: 12 }
        },
        message: "Deprecated"
      })
    );
  });

  test("a deprecated property is reported on its key even if its value is invalid", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "deprecated": true
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": 42
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    // The invalid value is also reported as a validation error
    const deprecatedDiagnostics = (await diagnostics)
      .filter((diagnostic) => diagnostic.tags?.includes(DiagnosticTag.Deprecated));
    expect(deprecatedDiagnostics).toEqual([
      expect.objectContaining({
        range: {
          start: { line: 2, character: 6 },
          end: { line: 2, character: 12 }
        },
        message: "Deprecated"
      })
    ]);
  });

  test("a deprecated nested property is reported on its key", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "outer": {
          "type": "object",
          "properties": {
            "inner": { "deprecated": true }
          }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "outer": { "inner": 1 }
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({
        range: {
          start: { line: 2, character: 17 },
          end: { line: 2, character: 24 }
        },
        message: "Deprecated"
      })
    ]);
  });

  test("a deprecated array item is reported on the item", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "tags": {
          "type": "array",
          "items": {
            "anyOf": [
              { "const": "old", "deprecationMessage": "Use new." },
              { "const": "new" }
            ]
          }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "tags": ["new", "old"]
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({
        range: {
          start: { line: 2, character: 22 },
          end: { line: 2, character: 27 }
        },
        message: "Use new."
      })
    ]);
  });

  describe("deprecated locations and deprecated values", () => {
    beforeEach(async () => {
      fixtureSchemaUri = await client.writeDocument("schema.json", `{
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "foo": {
            "type": "string",
            "deprecated": true
          },
          "bar": {
            "anyOf": [
              { "const": "a", "deprecated": true },
              { "const": "b" }
            ]
          },
          "baz": {
            "deprecated": true,
            "anyOf": [
              { "const": "c", "deprecated": true },
              { "const": "d" }
            ]
          }
        }
      }`);
    });

    test("a deprecated location is marked on the key and a deprecated value on the value", async () => {
      await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo": "x",
      "bar": "a",
      "baz": "c"
    }`);
      const diagnostics = client.getDiagnostics("instance.json");
      await client.openDocument("instance.json");

      await expect(diagnostics).resolves.toEqual([
        expect.objectContaining({ range: { start: { line: 2, character: 6 }, end: { line: 2, character: 11 } } }),
        expect.objectContaining({ range: { start: { line: 3, character: 13 }, end: { line: 3, character: 16 } } }),
        expect.objectContaining({ range: { start: { line: 4, character: 6 }, end: { line: 4, character: 11 } } }),
        expect.objectContaining({ range: { start: { line: 4, character: 13 }, end: { line: 4, character: 16 } } })
      ]);
    });

    test("a value that isn't deprecated isn't marked even if the location or other values are", async () => {
      await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "bar": "b",
      "baz": "d"
    }`);
      const diagnostics = client.getDiagnostics("instance.json");
      await client.openDocument("instance.json");

      await expect(diagnostics).resolves.toEqual([
        expect.objectContaining({ range: { start: { line: 3, character: 6 }, end: { line: 3, character: 11 } } })
      ]);
    });
  });

  test("no diagnostics when nothing is deprecated", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice"
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });
});

describe("Deprecated Diagnostics without deprecated tag support", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start({
      capabilities: {
        textDocument: {
          publishDiagnostics: {
            tagSupport: { valueSet: [DiagnosticTag.Unnecessary] }
          }
        }
      }
    });
  });

  afterEach(async () => {
    await client.stop();
  });

  test("deprecation isn't reported", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "deprecated": true
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice"
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });
});
