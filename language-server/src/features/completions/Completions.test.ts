import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CompletionRequest, CompletionTriggerKind } from "vscode-languageserver";
import { TestClient } from "../../test/TestClient.ts";

describe("Completions", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("should register the completion provider capability", async () => {
    expect(client.serverCapabilities!.completionProvider).toEqual({
      triggerCharacters: [":", "\"", "\n", " "]
    });
  });

  test("should provide completions when triggered by a space after a colon", async () => {
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
      position: { line: 2, character: 15 },
      context: {
        triggerKind: CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: " "
      }
    });

    expect(completions).not.toEqual([]);
  });

  test("should provide completions when triggered by a space after a comma", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "array",
          "items": { "const": "foo" }
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": ["foo", ]
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 23 },
      context: {
        triggerKind: CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: " "
      }
    });

    expect(completions).not.toEqual([]);
  });

  test("should not provide completions when triggered by a space inside a string", async () => {
    const fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": "hello, "
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 22 },
      context: {
        triggerKind: CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: " "
      }
    });

    expect(completions).toEqual([]);
  });

  test("should not crash when triggered by a space in a document with no parseable JSON", async () => {
    await client.writeDocument("instance.json", ``);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 0, character: 0 },
      context: {
        triggerKind: CompletionTriggerKind.TriggerCharacter,
        triggerCharacter: " "
      }
    });

    expect(completions).toEqual([]);
  });

  test("should return no completions in an empty document", async () => {
    await client.writeDocument("instance.json", ``);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 0, character: 0 }
    });

    expect(completions).toEqual([]);
  });

  test("should return no completions after the root value", async () => {
    await client.writeDocument("instance.json", `{}

`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 0 }
    });

    expect(completions).toEqual([]);
  });
});
