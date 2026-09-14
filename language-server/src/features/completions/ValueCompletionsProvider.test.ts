import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CompletionItem, CompletionItemKind, CompletionRequest, InsertTextFormat } from "vscode-languageserver";
import { TestClient } from "../../test/TestClient.ts";

describe("Value Completions", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("empty schema", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {}
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: "null" },
      { label: "true" },
      { label: "false" },
      { label: "number", textEdit: { newText: " $0" } },
      { label: `""`, textEdit: { newText: ` "$0"` } },
      { label: "[]", textEdit: { newText: " [$0]" } },
      { label: "{}", textEdit: { newText: " {$0}" } }
    ]);
  });

  test("boolean schema true", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": true
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: "null" },
      { label: "true" },
      { label: "false" },
      { label: "number", textEdit: { newText: " $0" } },
      { label: `""`, textEdit: { newText: ` "$0"` } },
      { label: "[]", textEdit: { newText: " [$0]" } },
      { label: "{}", textEdit: { newText: " {$0}" } }
    ]);
  });

  test("boolean schema false", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": false
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toEqual([]);
  });

  test("completions on property key", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value"
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 12 }
    });

    expect(completions).toHaveLength(0);
  });

  test("completions on colon", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions[0].textEdit).toEqual({
      range: {
        start: { line: 2, character: 13 },
        end: { line: 2, character: 14 }
      },
      newText: ` "foo"`
    });
  });

  test("completions on colon with a space", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": 
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 14 }
    }) as CompletionItem[];

    expect(completions[0].textEdit).toEqual({
      range: {
        start: { line: 2, character: 14 },
        end: { line: 2, character: 14 }
      },
      newText: `"foo"`
    });
  });

  test("completions for different properties", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    });

    expect(completions).toEqual([]);
  });

  test("completions on open character", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": "
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    }) as CompletionItem[];

    expect(completions[0].textEdit).toEqual({
      range: {
        start: { line: 2, character: 15 },
        end: { line: 2, character: 16 }
      },
      newText: `"foo"`
    });
  });

  test("completions on empty group", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ""
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    }) as CompletionItem[];

    expect(completions[0].textEdit).toEqual({
      range: {
        start: { line: 2, character: 15 },
        end: { line: 2, character: 17 }
      },
      newText: `"foo"`
    });
  });

  test("completions on partial group", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": "f"
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 16 }
    }) as CompletionItem[];

    expect(completions[0].textEdit).toEqual({
      range: {
        start: { line: 2, character: 15 },
        end: { line: 2, character: 18 }
      },
      newText: `"foo"`
    });
  });

  test("completion kind", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions[0].kind).toEqual(CompletionItemKind.Value);
  });

  test("completion insertTextFormat", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions[0].insertTextFormat).toEqual(InsertTextFormat.Snippet);
  });

  test("const keyword", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"foo"` }
    ]);
  });

  test("enum keyword", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "enum": ["red", "green", "blue"] }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"green"` },
      { label: `"blue"` }
    ]);
  });

  test("enum with mixed value types", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "enum": ["red", null, 42] }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `null` },
      { label: `"red"` },
      { label: `42` }
    ]);
  });

  test("type null", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "type": "null" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `null` }
    ]);
  });

  test("type boolean", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "type": "boolean" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `true` },
      { label: `false` }
    ]);
  });

  test("type number", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: "number" }
    ]);
  });

  test("type integer", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "integer" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: "integer" }
    ]);
  });

  test("type string", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: `""` }
    ]);
  });

  test("type array", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "array" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: `[]` }
    ]);
  });

  test("type object", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "object" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: `{}` }
    ]);
  });

  test("array-form type keyword", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "type": ["boolean", "null"] }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `null` },
      { label: `true` },
      { label: `false` }
    ]);
  });

  test("same value contributed multiple times in the same subschema", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "boolean",
          "enum": [true, false]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `true` },
      { label: `false` }
    ]);
  });

  test("narrowing values with allOf", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "allOf": [
            { "type": "boolean" },
            { "enum": [true] }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `true` }
    ]);
  });

  test("number and integer narrowing", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "allOf": [
            { "type": "number" },
            { "type": "integer" }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: "integer" }
    ]);
  });

  test("integer and number narrowing", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "allOf": [
            { "type": "integer" },
            { "type": "number" }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: "integer" }
    ]);
  });

  test("combining values with anyOf", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "anyOf": [
            { "type": "boolean" },
            { "enum": [true, false] }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `true` },
      { label: `false` }
    ]);
  });

  test("combining number and integer with anyOf", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "anyOf": [
            { "type": "number" },
            { "type": "integer" }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: "number" }
    ]);
  });

  test("anyOf inside a property's own schema unions branches", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "format": {
          "anyOf": [
            { "enum": ["uri", "ipv4", "email", "date"] },
            { "type": "string" }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "format":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 14 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: `"uri"` },
      { label: `"ipv4"` },
      { label: `"email"` },
      { label: `"date"` },
      { label: `""` }
    ]);
  });

  test("unconstrained anyOf branch offers its value plus every basic type", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "anyOf": [
        {
          "properties": {
            "mode": { "const": "strict" },
            "value": { "enum": ["auto", "off"] }
          }
        },
        {
          "properties": {
            "mode": { "const": "legacy" },
            "value": {}
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: `"auto"` },
      { label: `"off"` },
      { label: "null" },
      { label: "true" },
      { label: "false" },
      { label: "number" },
      { label: `""` },
      { label: "[]" },
      { label: "{}" }
    ]);
  });

  test("combining values with oneOf", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "oneOf": [
            { "enum": ["a", "b"] },
            { "enum": ["b", "c"] },
            { "enum": ["b", "d"] }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"c"` },
      { label: `"d"` }
    ]);
  });

  test("combining number and integer with oneOf", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "oneOf": [
            { "type": "number" },
            { "type": "integer" }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: "number" }
    ]);
  });

  test("narrow values contributed in different subschemas with allOf", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "value": { "const": true }
          }
        },
        {
          "properties": {
            "value": { "type": "boolean" }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `true` }
    ]);
  });

  test("narrow enum values", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "color": { "enum": ["red", "amber", "pink"] }
          }
        },
        {
          "properties": {
            "color": { "enum": ["red", "green", "blue"] }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` }
    ]);
  });

  test("allOf returns no completions when enum and type are incompatible", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "color": { "type": "string" }
          }
        },
        {
          "properties": {
            "color": { "enum": [false, 42, null] }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toEqual([]);
  });

  test("allOf returns no completions when types are conflicting", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "name": { "type": "string" }
          }
        },
        {
          "properties": {
            "name": { "type": "boolean" }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toEqual([]);
  });

  test("allOf suggests string template when both branches declare the same type", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "name": { "type": "string" }
          }
        },
        {
          "properties": {
            "name": { "type": "string" }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: `""` }
    ]);
  });

  test("allOf intersects common non-scalar enum values", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "foo": { "enum": [{ "a": 1, "b": 2 }] }
          }
        },
        {
          "properties": {
            "foo": { "enum": [{ "b": 2, "a": 1 }] }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: `{"a":1,"b":2}` }
    ]);
  });

  test("combine values contributed in different subschemas with anyOf", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "anyOf": [
        {
          "properties": {
            "value": { "const": true }
          }
        },
        {
          "properties": {
            "value": { "type": "boolean" }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `true` },
      { label: `false` }
    ]);
  });

  test("combine values contributed in different subschemas with oneOf", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "oneOf": [
        {
          "properties": {
            "value": { "enum": ["a", "b"] }
          }
        },
        {
          "properties": {
            "value": { "enum": ["b", "c"] }
          }
        },
        {
          "properties": {
            "value": { "enum": ["b", "d"] }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"c"` },
      { label: `"d"` }
    ]);
  });

  test("combine values contributed in different subschemas with anyOf and allOf", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "value": { "enum": ["a", "c"] }
          }
        },
        {
          "anyOf": [
            {
              "properties": {
                "value": { "enum": ["a", "b"] }
              }
            },
            {
              "properties": {
                "value": { "enum": ["b", "c"] }
              }
            }
          ]
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"c"` }
    ]);
  });

  test("properties with the same name at different levels in the instance value (top)", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "top" },
        "nested": {
          "type": "object",
          "properties": {
            "value": { "enum": ["nested-a", "nested-b"] }
          }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"top"` }
    ]);
  });

  test("properties with the same name at different levels in the instance value (nested)", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "top" },
        "nested": {
          "type": "object",
          "properties": {
            "value": { "enum": ["nested-a", "nested-b"] }
          }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "nested": {
        "value":
      }
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 15 }
    });

    expect(completions).toMatchObject([
      { label: `"nested-a"` },
      { label: `"nested-b"` }
    ]);
  });

  test("oneOf nested in allOf is intersected with the outer values", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "color": { "enum": ["amber", "blue"] }
          }
        },
        {
          "oneOf": [
            {
              "properties": {
                "color": { "enum": ["red", "blue"] }
              }
            },
            {
              "properties": {
                "color": { "enum": ["green", "yellow"] }
              }
            }
          ]
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"blue"` }
    ]);
  });

  test("allOf nested in anyOf is intersected before the union", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "anyOf": [
        {
          "allOf": [
            {
              "properties": {
                "color": { "enum": ["red", "amber", "pink"] }
              }
            },
            {
              "properties": {
                "color": { "enum": ["red", "green"] }
              }
            }
          ]
        },
        {
          "properties": {
            "color": { "enum": ["black"] }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"black"` }
    ]);
  });

  test("allOf narrows oneOf union values to the declared type", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "foo": { "type": "string" }
          }
        },
        {
          "oneOf": [
            {
              "properties": {
                "foo": { "enum": ["red", 42] }
              }
            },
            {
              "properties": {
                "foo": { "enum": ["blue", null] }
              }
            }
          ]
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"blue"` }
    ]);
  });

  test("allOf inside a oneOf branch is intersected before the branch difference", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "oneOf": [
        {
          "allOf": [
            {
              "properties": {
                "color": { "enum": ["red", "amber", "pink"] }
              }
            },
            {
              "properties": {
                "color": { "enum": ["red", "green"] }
              }
            }
          ]
        },
        {
          "properties": {
            "color": { "enum": ["black"] }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"black"` }
    ]);
  });

  test("allOf inside a property's own schema intersects the branch values", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": {
          "allOf": [
            { "enum": ["red", "blue", "green"] },
            { "enum": ["red", "green"] }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"green"` }
    ]);
  });

  test("allOf intersects compatible enum and type values from branches", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "color": { "type": "string" }
          }
        },
        {
          "properties": {
            "color": { "enum": ["red", 42, null] }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` }
    ]);
  });

  test("not excludes const", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": {
          "enum": ["red", "blue", "green"],
          "not": { "const": "red" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"blue"` },
      { label: `"green"` }
    ]);
  });

  test("not excludes enum", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": {
          "enum": ["red", "blue", "green"],
          "not": { "enum": ["red"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"blue"` },
      { label: `"green"` }
    ]);
  });

  test("not excludes type", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "values": {
          "enum": ["foo", 42, true],
          "not": { "type": "string" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "values":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `true` },
      { label: `42` }
    ]);
  });

  test("not excludes multiple types", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "values": {
          "enum": ["foo", 42, true],
          "not": { "type": ["string", "number"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "values":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `true` }
    ]);
  });

  test("not excludes integer from number", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "values": {
          "type": "number",
          "not": { "type": "integer" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "values":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `number` }
    ]);
  });

  test("not excludes number from integer", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "values": {
          "type": "integer",
          "not": { "type": "number" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "values":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([]);
  });

  test("not inside oneOf filters enum values by type and not, then unions", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "oneOf": [
        {
          "properties": {
            "level": {
              "type": "string",
              "enum": ["warn", "debug", 0, 1],
              "not": { "const": "debug" }
            }
          }
        },
        {
          "properties": {
            "level": {
              "enum": ["debug", "trace"],
              "not": { "const": "debug" }
            }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "level":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"warn"` },
      { label: `"trace"` }
    ]);
  });

  test("not excludes a const value from a boolean type", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": {
          "type": "boolean",
          "not": { "const": true }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `false` }
    ]);
  });

  test("not inside an allOf branch excludes values from the intersection", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "color": { "enum": ["red", "green", "blue"] }
          }
        },
        {
          "properties": {
            "color": {
              "enum": ["blue", "red"],
              "not": { "const": "blue" }
            }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` }
    ]);
  });

  test("not inside anyOf keeps a value unless every branch excludes it", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "anyOf": [
        {
          "properties": {
            "os": {
              "enum": ["linux", "windows", "mac"],
              "not": { "const": "linux" }
            }
          }
        },
        {
          "properties": {
            "os": {
              "enum": ["linux", "windows"],
              "not": { "const": "windows" }
            }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "os":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 10 }
    });

    expect(completions).toMatchObject([
      { label: `"windows"` },
      { label: `"mac"` },
      { label: `"linux"` }
    ]);
  });

  test("not inside a oneOf branch narrows values before the branch difference", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "oneOf": [
        {
          "properties": {
            "color": {
              "enum": ["red", "green", "blue"],
              "not": { "const": "green" }
            }
          }
        },
        {
          "properties": {
            "color": { "enum": ["yellow", "blue"] }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"yellow"` }
    ]);
  });

  test("not on a const has no effect on a general type's completion", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "not": { "const": "foo" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: `""` }
    ]);
  });

  test("not excludes a type from the property's own type array", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": ["string", "number"],
          "not": { "type": "string" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: "number" }
    ]);
  });

  test("not type inside an allOf branch narrows the type array from another branch", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "allOf": [
        {
          "properties": {
            "value": { "type": ["string", "number", "boolean"] }
          }
        },
        {
          "properties": {
            "value": { "not": { "type": "boolean" } }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: "number" },
      { label: `""` }
    ]);
  });

  test("excluded value is not re-added when intersected with later enum values", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "allOf": [
            { "not": { "const": "red" } },
            { "type": "string" },
            { "enum": ["red", "blue"] }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"blue"` }
    ]);
  });

  test("not excludes the forbidden value instead of requiring it", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "foo": { "enum": ["a", "b", "bad"] }
      },
      "not": {
        "properties": {
          "foo": { "const": "bad" }
        },
        "required": ["foo"]
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("not touching multiple properties does not incorrectly narrow either one", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "a": { "enum": ["x", "y"] },
        "b": { "enum": ["p", "q"] }
      },
      "not": {
        "properties": {
          "a": { "const": "x" },
          "b": { "const": "p" }
        },
        "required": ["a", "b"]
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": "x",
      "b":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: `"q"` }
    ]);
  });

  test("boolean not schema does not break completions", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "foo": { "enum": ["a", "b"] }
      },
      "not": false
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("then applies when the if condition is met", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "shape": { "const": "circle" }
      },
      "if": {
        "properties": { "shape": { "const": "circle" } }
      },
      "then": {
        "properties": { "radius": { "type": "number" } }
      },
      "else": {
        "properties": { "radius": { "type": "string" } }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "shape": "circle",
      "radius":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 14 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: "number" }
    ]);
  });

  test("else applies when the if condition isn't met", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "shape": { "const": "square" }
      },
      "if": {
        "properties": { "shape": { "const": "circle" } }
      },
      "then": {
        "properties": { "radius": { "type": "number" } }
      },
      "else": {
        "properties": { "radius": { "type": "string" } }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "shape": "square",
      "radius":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 14 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: `""` }
    ]);
  });

  test("if must not narrow a real property's value completions", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "enum": ["red", "blue"] }
      },
      "if": {
        "properties": { "color": { "const": "red" } }
      },
      "then": {
        "properties": { "font": { "const": "bold" } }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"blue"` }
    ]);
  });

  test("dependentSchemas narrows value completion when dependent property is present", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "type": { "enum": ["foo", "bar"] },
        "value": {}
      },
      "dependentSchemas": {
        "type": {
          "properties": {
            "value": { "type": "number" }
          }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "type": "foo",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 12 }
    });

    expect(completions).toMatchObject([
      { label: "number" }
    ]);
  });

  test("dependentSchemas doesn't narrow value completion when dependent property is absent", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "type": { "enum": ["foo", "bar"] },
        "value": {}
      },
      "dependentSchemas": {
        "type": {
          "properties": {
            "value": { "type": "number" }
          }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 12 }
    });

    expect(completions).toMatchObject([
      { label: "null" },
      { label: "true" },
      { label: "false" },
      { label: "number" },
      { label: `""` },
      { label: "[]" },
      { label: "{}" }
    ]);
  });

  test("completion works with $ref", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "$ref": "#/$defs/color" }
      },
      "$defs": {
        "color": {
          "enum": ["red", "green", "blue"]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"green"` },
      { label: `"blue"` }
    ]);
  });

  test("completion works with recursive schemas", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "type": "string" },
        "branch": {
          "type": "array",
          "items": { "$ref": "#" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "branch": [
        {
          "branch":
        }
      ]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 18 }
    });

    expect(completions).toMatchObject([
      { label: "[]" }
    ]);
  });

  test("completion works with $dynamicRef", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/v1",
      "$ref": "main",

      "$defs": {
        "main": {
          "$id": "main",
          "type": "object",
          "properties": {
            "color": { "$dynamicRef": "#color" }
          }
        },
        "color": {
          "$dynamicAnchor": "color",
          "enum": ["red", "green", "blue"]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"green"` },
      { label: `"blue"` }
    ]);
  });

  test("completion works with 2020-12 $dynamicRef", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$ref": "main",

      "$defs": {
        "main": {
          "$id": "main",
          "type": "object",
          "properties": {
            "color": { "$dynamicRef": "#color" }
          },
          "$defs": {
            "color": {
              "$dynamicAnchor": "color",
              "type": "string"
            }
          }
        },
        "color": {
          "$dynamicAnchor": "color",
          "enum": ["red", "green", "blue"]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"green"` },
      { label: `"blue"` }
    ]);
  });

  test("completion works with 2020-12 $dynamicRef when falling back to static behavior", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "main",
      "type": "object",
      "properties": {
        "color": { "$dynamicRef": "#/$defs/color" }
      },
      "$defs": {
        "color": {
          "enum": ["red", "green", "blue"]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"red"` },
      { label: `"green"` },
      { label: `"blue"` }
    ]);
  });

  test("completion works with $recursiveRef", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2019-09/schema",
      "$recursiveAnchor": true,
      "$ref": "#/$defs/tree",
      "properties": {
        "branch": { "maxItems": 3 }
      },
      "$defs": {
        "tree": {
          "$id": "tree",
          "$recursiveAnchor": true,
          "type": "object",
          "properties": {
            "value": { "type": "string" },
            "branch": {
              "type": "array",
              "items": { "$recursiveRef": "#" }
            }
          }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "branch":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 14 }
    });

    expect(completions).toMatchObject([
      { label: "[]" }
    ]);
  });

  test("additionalProperties: value completion for a property not covered by 'properties'", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "type": "number" }
      },
      "additionalProperties": { "enum": ["a", "b"] }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("additionalProperties: true offers every basic type", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "type": "number" }
      },
      "additionalProperties": true
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: `null` },
      { label: `true` },
      { label: `false` },
      { label: "number" },
      { label: `""` },
      { label: "[]" },
      { label: "{}" }
    ]);
  });

  test("additionalProperties: false offers no completions", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "type": "number" }
      },
      "additionalProperties": false
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    });

    expect(completions).toEqual([]);
  });

  test("patternProperties: value completion for a property matching a pattern", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "patternProperties": {
        "^str_": { "type": "string" },
        "^num_": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "str_first":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 18 }
    });

    expect(completions).toMatchObject([
      { label: `""` }
    ]);
  });

  test("patternProperties: a property not matching any pattern gets no completions", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "patternProperties": {
        "^str_": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "other":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 10 }
    });

    expect(completions).toEqual([]);
  });

  test("patternProperties: multiple matching patterns are combined", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "patternProperties": {
        "^str_": { "type": "string" },
        "_foo$": { "enum": ["exact"] }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "str_foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 16 }
    });

    expect(completions).toMatchObject([
      { label: `"exact"` }
    ]);
  });

  test("patternProperties: multiple matching patterns narrow each other, not just replace", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "patternProperties": {
        "^a": { "enum": ["a", "b", "c"] },
        "b$": { "enum": ["b", "c", "d"] }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "ab":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 10 }
    });

    expect(completions).toMatchObject([
      { label: `"b"` },
      { label: `"c"` }
    ]);
  });

  test("properties and a matching patternProperties pattern both apply", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "foo": { "const": "a" }
      },
      "patternProperties": {
        "^f": { "enum": ["a", "b"] }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` }
    ]);
  });

  test("unevaluatedProperties: false offers no completions", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "allOf": [
            {
              "properties": {
                "known": { "type": "string" }
              }
            }
          ],
          "unevaluatedProperties": false
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "known": "foo",
        "extra":
      }
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 15 }
    });

    expect(completions).toEqual([]);
  });

  test("unevaluatedProperties: value completion for a property not covered by 'properties'", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "allOf": [
            {
              "properties": {
                "known": { "type": "string" }
              }
            }
          ],
          "unevaluatedProperties": { "enum": ["yes", "no"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "known": "foo",
        "extra":
      }
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 15 }
    });

    expect(completions).toMatchObject([
      { label: `"yes"` },
      { label: `"no"` }
    ]);
  });

  test("additionalProperties takes precedence over unevaluatedProperties", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "allOf": [
            {
              "properties": {
                "known": { "type": "string" }
              },
              "additionalProperties": { "enum": ["a", "b"] }
            }
          ],
          "unevaluatedProperties": { "enum": ["c", "d"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "known": "foo",
        "extra":
      }
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 15 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("anyOf: additionalProperties from multiple branches are combined", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "anyOf": [
        {
          "type": "object",
          "additionalProperties": { "enum": ["a"] }
        },
        {
          "type": "object",
          "additionalProperties": { "enum": ["b"] }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("anyOf: a nested object property declared differently per branch is unioned, not intersected", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "anyOf": [
        {
          "properties": {
            "meta": {
              "type": "object",
              "properties": { "tag": { "const": "one" } }
            }
          }
        },
        {
          "properties": {
            "meta": {
              "type": "object",
              "properties": { "tag": { "const": "two" } }
            }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "meta": {
        "tag":
      }
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"one"` },
      { label: `"two"` }
    ]);
  });

  test("oneOf: a nested object property declared differently per branch is combined per-branch, not intersected globally", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "oneOf": [
        {
          "properties": {
            "meta": {
              "type": "object",
              "properties": { "tag": { "const": "one" } }
            }
          }
        },
        {
          "properties": {
            "meta": {
              "type": "object",
              "properties": { "tag": { "const": "two" } }
            }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "meta": {
        "tag":
      }
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 13 }
    });

    expect(completions).toMatchObject([
      { label: `"one"` },
      { label: `"two"` }
    ]);
  });

  test("anyOf and allOf siblings", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "anyOf": [
        {
          "properties": {
            "value": { "const": "a" }
          }
        },
        {
          "properties": {
            "value": { "const": "b" }
          }
        }
      ],
      "allOf": [
        {
          "properties": {
            "value": { "enum": ["a", "b", "c"] }
          }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("anyOf offers union of types before a discriminant is typed", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "anyOf": [
        {
          "properties": {
            "foo": { "const": "a" },
            "bar": { "type": "null" }
          },
          "required": ["foo"]
        },
        {
          "properties": {
            "foo": { "const": "b" },
            "bar": { "type": "boolean" }
          },
          "required": ["foo"]
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "bar":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 11 }
    }) as CompletionItem[];

    expect(completions).toMatchObject([
      { label: `null` },
      { label: `true` },
      { label: `false` }
    ]);
  });

  test("anyOf narrows to the branch matching the discriminant", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "anyOf": [
        {
          "properties": {
            "foo": { "const": "a" },
            "bar": { "enum": ["foo", "bar"] }
          },
          "required": ["foo"]
        },
        {
          "properties": {
            "foo": { "const": "b" },
            "bar": { "enum": ["a", "b"] }
          },
          "required": ["foo"]
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo": "a",
      "bar":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: `"foo"` },
      { label: `"bar"` }
    ]);
  });

  test("oneOf narrows to the branch matching the discriminant", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "oneOf": [
        {
          "properties": {
            "foo": { "const": "a" },
            "bar": { "enum": ["foo", "bar"] }
          },
          "required": ["foo"]
        },
        {
          "properties": {
            "foo": { "const": "b" },
            "bar": { "enum": ["a", "b"] }
          },
          "required": ["foo"]
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "foo": "b",
      "bar":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("additionalProperties narrows when oneOf branches", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "version": { "const": "web" }
          },
          "additionalProperties": { "type": "boolean" }
        },
        {
          "type": "object",
          "properties": {
            "version": { "const": "desktop" }
          },
          "additionalProperties": { "type": "object" }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "version": "web",
      "darkmode":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 15 }
    });

    expect(completions).toMatchObject([
      { label: `true` },
      { label: `false` }
    ]);
  });

  test("additionalProperties offers nothing when both alternative branches are filtered", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "version": { "const": "web" }
          },
          "additionalProperties": { "type": "boolean" }
        },
        {
          "type": "object",
          "properties": {
            "version": { "const": "desktop" }
          },
          "additionalProperties": { "type": "object" }
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "version": "web",
      "rollout": {},
      "darkmode":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 15 }
    });

    expect(completions).toEqual([]);
  });

  test("oneOf keeps a valid branch whose own discriminant is resolved by a nested anyOf", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "oneOf": [
        {
          "properties": {
            "kind": { "const": "A" },
            "x": { "anyOf": [{ "const": "yes" }, { "const": "no" }] },
            "extra": { "const": "onlyA" }
          },
          "required": ["kind"]
        },
        {
          "properties": {
            "kind": { "const": "B" },
            "extra": { "const": "onlyB" }
          },
          "required": ["kind"]
        }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "kind": "A",
      "x": "yes",
      "extra":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 14 }
    });

    expect(completions).toMatchObject([
      { label: `"onlyA"` }
    ]);
  });

  test("value completion for an item in an empty array", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "const": "a" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": []
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    });

    expect(completions).toMatchObject([
      {
        label: `"a"`,
        textEdit: {
          range: {
            start: { line: 2, character: 15 },
            end: { line: 2, character: 15 }
          },
          newText: `"a"`
        }
      }
    ]);
  });

  test("value completion for an existing array item value", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "const": "a" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": [""]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 16 }
    });

    expect(completions).toMatchObject([
      {
        label: `"a"`,
        textEdit: {
          range: {
            start: { line: 2, character: 16 },
            end: { line: 2, character: 18 }
          },
          newText: `"a"`
        }
      }
    ]);
  });

  test("value completion for a partially typed array item value", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "const": "a" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["f"]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 17 }
    });

    expect(completions).toMatchObject([
      {
        label: `"a"`,
        textEdit: {
          range: {
            start: { line: 2, character: 16 },
            end: { line: 2, character: 19 }
          },
          newText: `"a"`
        }
      }
    ]);
  });

  test("value completion for a new item after a trailing comma", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "const": "a" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a",]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 19 }
    });

    expect(completions).toMatchObject([
      {
        label: `"a"`,
        textEdit: {
          range: {
            start: { line: 2, character: 19 },
            end: { line: 2, character: 19 }
          },
          newText: ` "a"`
        }
      }
    ]);
  });

  test("value completion for a new item after a trailing comma with a space", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "const": "a" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a", ]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 20 }
    });

    expect(completions).toMatchObject([
      {
        label: `"a"`,
        textEdit: {
          range: {
            start: { line: 2, character: 20 },
            end: { line: 2, character: 20 }
          },
          newText: `"a"`
        }
      }
    ]);
  });

  test("value completion for a new item at the beginning of an array", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "const": "a" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": [, "a"]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    });

    expect(completions).toMatchObject([
      {
        label: `"a"`,
        textEdit: {
          range: {
            start: { line: 2, character: 15 },
            end: { line: 2, character: 15 }
          },
          newText: `"a"`
        }
      }
    ]);
  });

  test("value completion for a new item in the middle of an array", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "const": "a" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a",, "a"]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 19 }
    });

    expect(completions).toMatchObject([
      {
        label: `"a"`,
        textEdit: {
          range: {
            start: { line: 2, character: 19 },
            end: { line: 2, character: 19 }
          },
          newText: ` "a"`
        }
      }
    ]);
  });

  test("items: property value completion inside an array item", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "tag": { "enum": ["one", "two"] }
            }
          }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": [
        {
          "tag":
        }
      ]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 14 }
    });

    expect(completions).toMatchObject([
      { label: `"one"` },
      { label: `"two"` }
    ]);
  });

  test("items: value completion for a nested array item", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": {
            "type": "array",
            "items": { "enum": ["x", "y"] }
          }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": [[]]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 16 }
    });

    expect(completions).toMatchObject([
      { label: `"x"` },
      { label: `"y"` }
    ]);
  });

  test("prefixItems: value completion for first item", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "prefixItems": [
            { "enum": ["a", "b"] },
            { "enum": ["c", "d"] }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": []
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("prefixItems: value completion for a subsequent item", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "prefixItems": [
            { "enum": ["a", "b"] },
            { "enum": ["c", "d"] }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a",]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 19 }
    });

    expect(completions).toMatchObject([
      { label: `"c"` },
      { label: `"d"` }
    ]);
  });

  test("prefixItems takes precedence over items", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "prefixItems": [
            { "enum": ["a", "b"] }
          ],
          "items": { "enum": ["z"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": []
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("prefixItems takes precedence over unevaluatedItems", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "allOf": [
            {
              "prefixItems": [
                { "enum": ["a", "b"] }
              ]
            }
          ],
          "unevaluatedItems": { "enum": ["z"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": []
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("unevaluatedItems applies to items beyond the prefixItems", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "allOf": [
            {
              "prefixItems": [
                { "enum": ["a", "b"] }
              ]
            }
          ],
          "unevaluatedItems": { "enum": ["z"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a",]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 19 }
    });

    expect(completions).toMatchObject([
      { label: `"z"` }
    ]);
  });

  test("items takes precedence over unevaluatedItems", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "allOf": [
            {
              "type": "array",
              "prefixItems": [
                { "enum": ["a", "b"] }
              ],
              "items": { "enum": ["z"] }
            }
          ],
          "unevalutatedItems": false
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a",]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 19 }
    });

    expect(completions).toMatchObject([
      { label: `"z"` }
    ]);
  });

  test("items (draft-07): value completion for an item in an empty array", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "const": "a" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": []
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    });

    expect(completions).toMatchObject([
      {
        label: `"a"`,
        textEdit: {
          range: {
            start: { line: 2, character: 15 },
            end: { line: 2, character: 15 }
          },
          newText: `"a"`
        }
      }
    ]);
  });

  test("items (draft-07): value completion for a new item after a trailing comma", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "const": "a" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a",]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 19 }
    });

    expect(completions).toMatchObject([
      {
        label: `"a"`,
        textEdit: {
          range: {
            start: { line: 2, character: 19 },
            end: { line: 2, character: 19 }
          },
          newText: ` "a"`
        }
      }
    ]);
  });

  test("items (draft-07): tuple form value completion for first item", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": [
            { "enum": ["a", "b"] },
            { "enum": ["c", "d"] }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": []
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("items (draft-07): tuple form value completion for a subsequent item", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": [
            { "enum": ["a", "b"] },
            { "enum": ["c", "d"] }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a",]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 19 }
    });

    expect(completions).toMatchObject([
      { label: `"c"` },
      { label: `"d"` }
    ]);
  });

  test("additionalItems (draft-07): value completion for an item beyond the tuple", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": [
            { "enum": ["a", "b"] },
            { "enum": ["c", "d"] }
          ],
          "additionalItems": { "enum": ["z"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a", "b",]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 24 }
    });

    expect(completions).toMatchObject([
      { label: `"z"` }
    ]);
  });

  test("items (draft-07): tuple takes precedence over additionalItems", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": [
            { "enum": ["a", "b"] },
            { "enum": ["c", "d"] }
          ],
          "additionalItems": { "enum": ["z"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": []
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("additionalItems (draft-07): ignored when items is a single schema", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "enum": ["a", "b"] },
          "additionalItems": { "enum": ["z"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a",]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 19 }
    });

    expect(completions).toMatchObject([
      { label: `"a"` },
      { label: `"b"` }
    ]);
  });

  test("unevaluatedItems (draft-2019-09): applies to items beyond the tuple", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2019-09/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "allOf": [
            {
              "items": [
                { "enum": ["a", "b"] }
              ]
            }
          ],
          "unevaluatedItems": { "enum": ["z"] }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["a",]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 19 }
    });

    expect(completions).toMatchObject([
      { label: `"z"` }
    ]);
  });
});
