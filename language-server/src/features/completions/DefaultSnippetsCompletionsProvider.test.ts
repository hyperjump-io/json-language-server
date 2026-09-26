import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CompletionItemKind, CompletionRequest, InsertTextFormat } from "vscode-languageserver";
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

  test("defaultSnippets with bodyText inserts the escaped string literal", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "string",
          "defaultSnippets": [
            {
              "label": "Name",
              "bodyText": "\\"name\\""
            }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ""
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 16 }
    });

    expect(completions).toContainEqual({
      label: "Name",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: {
        range: {
          start: { line: 2, character: 15 },
          end: { line: 2, character: 17 }
        },
        newText: "\"name\""
      }
    });
  });

  test("defaultSnippets with body inserts a plain snippet string", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "string",
          "defaultSnippets": [
            {
              "label": "Object",
              "body": "{\\n  \\"name\\": \\"$1\\"\\n}"
            }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ""
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 16 }
    });

    expect(completions).toContainEqual({
      label: "Object",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: {
        range: {
          start: { line: 2, character: 15 },
          end: { line: 2, character: 17 }
        },
        newText: "{\n  \"name\": \"$1\"\n}"
      }
    });
  });

  test("defaultSnippets with body arrays join each line in order", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "string",
          "defaultSnippets": [
            {
              "label": "Object array",
              "body": [
                "{",
                "  \\"name\\": \\"$1\\"",
                "}"
              ]
            }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ""
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 16 }
    });

    expect(completions).toContainEqual({
      label: "Object array",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: {
        range: {
          start: { line: 2, character: 15 },
          end: { line: 2, character: 17 }
        },
        newText: "{\n  \"name\": \"$1\"\n}"
      }
    });
  });

  test("no completions are offered when the cursor is inside a property key", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "string",
          "defaultSnippets": [
            {
              "label": "Name",
              "bodyText": "\\"name\\""
            }
          ]
        }
      }
    }`);

    // The property already has a value, so a snippet offered here would carry a
    // textEdit range covering the key and clobber it.
    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ""
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 9 }
    });

    expect(completions).toEqual([]);
  });

  test("defaultSnippets annotations from all anyOf branches are offered for an incomplete location", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "anyOf": [
            {
              "type": "string",
              "defaultSnippets": [
                {
                  "label": "FromBranchOne",
                  "bodyText": "\\"one\\""
                }
              ]
            },
            {
              "type": "string",
              "defaultSnippets": [
                {
                  "label": "FromBranchTwo",
                  "bodyText": "\\"two\\""
                }
              ]
            }
          ]
        }
      }
    }`);

    // "value" is missing, so we don't know yet which anyOf branch will apply.
    // Both branches' defaultSnippets should be offered, same as buildCompletions
    // unions anyOf branches instead of picking one.
    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 14 }
    });

    expect(completions).toContainEqual(expect.objectContaining({ label: "FromBranchOne" }));
    expect(completions).toContainEqual(expect.objectContaining({ label: "FromBranchTwo" }));
  });

  test("defaultSnippets with a number body gets stringified without quotes", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "count": {
          "type": "integer",
          "defaultSnippets": [
            { "label": "Zero", "body": 0 }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "count":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 14 }
    });

    expect(completions).toContainEqual({
      label: "Zero",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: {
        range: {
          start: { line: 2, character: 14 },
          end: { line: 2, character: 14 }
        },
        newText: "0"
      }
    });
  });

  test("defaultSnippets with a boolean body gets stringified without quotes", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean",
          "defaultSnippets": [
            { "label": "True", "body": true }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "enabled":
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 16 }
    });

    expect(completions).toContainEqual({
      label: "True",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: {
        range: {
          start: { line: 2, character: 16 },
          end: { line: 2, character: 16 }
        },
        newText: "true"
      }
    });
  });

  test("defaultSnippets with a nested object body serializes recursively", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "object",
          "defaultSnippets": [
            {
              "label": "Nested",
              "body": { "user": { "name": "", "tags": ["a", "b"] } }
            }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": {}
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 16 }
    });

    expect(completions).toContainEqual({
      label: "Nested",
      kind: CompletionItemKind.Snippet,
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: {
        range: {
          start: { line: 2, character: 15 },
          end: { line: 2, character: 17 }
        },
        newText: "{\"user\":{\"name\":\"\",\"tags\":[\"a\",\"b\"]}}"
      }
    });
  });
});
