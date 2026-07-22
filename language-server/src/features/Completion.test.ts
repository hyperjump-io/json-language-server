import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CompletionRequest, CompletionItemKind, PublishDiagnosticsNotification } from "vscode-languageserver";
import { TestClient } from "../test/TestClient.ts";

describe("Completions", () => {
  let client: TestClient;
  let fixtureSchemaUri: string;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("completion returns null when there are no properties", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object"
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 7 }
    });

    expect(completions).toEqual([]);
  });

  test("completion returns properties", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 7 }
    });

    expect(completions).toEqual([
      { label: "name", kind: CompletionItemKind.Property }
    ]);
  });

  test("completion returns properties for nested object", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "address": {
          "type": "object",
          "properties": {
            "street": { "type": "string" },
            "city": { "type": "string" },
            "zipCode": { "type": "number" }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "address": {
      ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(completions).toEqual([
      { label: "street", kind: CompletionItemKind.Property },
      { label: "city", kind: CompletionItemKind.Property },
      { label: "zipCode", kind: CompletionItemKind.Property }
    ]);
  });

  test("completion excludes properties the object already has", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "number" },
        "city": { "type": "string" }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "name": "Alice",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(completions).toEqual([
      { label: "age", kind: CompletionItemKind.Property },
      { label: "city", kind: CompletionItemKind.Property }
    ]);
  });

  test("completion returns non duplicate properties across allOf", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "foo": { "type": "string" },
            "bar": { "type": "string" }
          },
          "required": ["foo"]
        },
        {
          "properties": {
            "foo": { "type": "string" },
            "baz": { "type": "string" }
          },
          "required": ["foo"]
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 7 }
    });

    expect(completions).toEqual([
      { label: "foo", kind: CompletionItemKind.Property },
      { label: "bar", kind: CompletionItemKind.Property },
      { label: "baz", kind: CompletionItemKind.Property }
    ]);
  });

  test("completion returns the union across a discriminated anyOf", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "anyOf": [
        {
          "properties": {
            "foo": { "type": "string" },
            "bar": { "type": "string" }
          },
          "required": ["foo"]
        },
        {
          "properties": {
            "foo": { "type": "string" },
            "baz": { "type": "string" }
          },
          "required": ["foo"]
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 7 }
    });

    expect(completions).toEqual([
      { label: "foo", kind: CompletionItemKind.Property },
      { label: "bar", kind: CompletionItemKind.Property },
      { label: "baz", kind: CompletionItemKind.Property }
    ]);
  });

  test("completion narrows completion for anyOf once the discriminant is typed", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "anyOf": [
        {
          "properties": { 
            "foo": { "type": "number" },
            "bar": { "type": "string" }
          },
          "required": ["foo"]
        },
        {
          "properties": { 
            "foo": { "type": "string" },
            "baz": { "type": "string" }
          },
          "required": ["foo"]
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "foo": 123,
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(completions).toEqual([
      { label: "bar", kind: CompletionItemKind.Property }
    ]);
  });

  test("completion returns properties for a discriminated oneOf", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "oneOf": [
        {
          "properties": {
            "foo": { "type": "string" },
            "bar": { "type": "string" }
          },
          "required": ["foo"]
        },
        {
          "properties": {
            "foo": { "type": "string" },
            "baz": { "type": "string" }
          },
          "required": ["foo"]
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 7 }
    });

    expect(completions).toEqual([
      { label: "foo", kind: CompletionItemKind.Property },
      { label: "bar", kind: CompletionItemKind.Property },
      { label: "baz", kind: CompletionItemKind.Property }
    ]);
  });

  test("completion narrows completion for oneOf once the discriminant is typed", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "oneOf": [
        {
          "properties": {
            "foo": { "const": "a" },
            "bar": { "type": "string" }
          },
          "required": ["foo"]
        },
        {
          "properties": {
            "foo": { "const": "b" },
            "baz": { "type": "string" }
          },
          "required": ["foo"]
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "foo": "a",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(completions).toEqual([
      { label: "bar", kind: CompletionItemKind.Property }
    ]);
  });
});
