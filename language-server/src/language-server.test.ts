import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import { TextDocumentSyncKind } from "vscode-languageserver";
import { TestClient } from "./test/test-client.ts";
import { registerSchema, unregisterSchema } from "@hyperjump/json-schema";

describe("JSON Language Server", () => {
  let client: TestClient;
  const fixtureSchemaUri = "https://example.com/person";

  beforeAll(async () => {
    client = new TestClient();
    await client.start();
  });

  afterAll(async () => {
    await client.stop();
  });

  afterEach(() => {
    unregisterSchema(fixtureSchemaUri);
  });

  test("textDocumentSync = Incremental", () => {
    expect(client.serverCapabilities?.textDocumentSync).to.equal(TextDocumentSyncKind.Incremental);
  });

  test("invalid JSON syntax returns a diagnostic", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("test.json", `{ "name": }`);
    await client.openDocument("test.json");

    const diagnostics = await diagnosticsPromise;
    expect(diagnostics).toHaveLength(1);
  });

  test("valid JSON Syntax should not return a diagnostic", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("test.json", `{ "Name": "Foo" }`);
    await client.openDocument("test.json");

    const diagnostics = await diagnosticsPromise;
    expect(diagnostics).toHaveLength(0);
  });

  test("JSON Validation using Hyperjump - Valid Case", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "name": "Alice",
    "age" : 39
    }`);
    await client.openDocument("instance.json");

    const diagnostics = await diagnosticsPromise;
    expect(diagnostics).toHaveLength(0);
  });

  test("JSON Validation using Hyperjump - Invalid Case", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "name": 1234,
    "age" : "hello"
    }`);
    await client.openDocument("instance.json");

    const diagnostics = (await diagnosticsPromise) as any[];
    expect(diagnostics).toHaveLength(2);
    const messages = diagnostics.map((d) => d.message);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Expected a.*string/),
        expect.stringMatching(/Expected a.*number/)
      ])
    );
  });

  test("JSON Validation using Hyperjump - anyOf Formatting Case", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        value: {
          anyOf: [
            { type: "string" },
            { type: "number" }
          ]
        }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "value": true
    }`);
    await client.openDocument("instance.json");

    const diagnostics = (await diagnosticsPromise) as any[];
    expect(diagnostics).toHaveLength(1);
    const cleanMessage = diagnostics[0].message.replace(/[\u2068\u2069]/g, "");
    expect(cleanMessage).toBe("Expected the value to match at least one alternative:\n  - Expected a string\n  - Expected a number");
  });

  test("JSON Validation using Hyperjump - oneOf Formatting Case", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    const testSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        value: {
          oneOf: [
            { type: "string" },
            { type: "number" }
          ]
        }
      }
    };

    registerSchema(testSchema, fixtureSchemaUri);

    await client.writeDocument("instance.json", `{
    "$schema": "${fixtureSchemaUri}",
    "value": true
    }`);
    await client.openDocument("instance.json");

    const diagnostics = (await diagnosticsPromise) as any[];
    expect(diagnostics).toHaveLength(1);
    const cleanMessage = diagnostics[0].message.replace(/[\u2068\u2069]/g, "");
    expect(cleanMessage).toBe("Expected the value to match exactly one alternative, but none matched:\n  - Expected a string\n  - Expected a number");
  });
});
