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

  test("boolean schema", async () => {
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
});
