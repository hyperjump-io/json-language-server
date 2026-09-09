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
});
