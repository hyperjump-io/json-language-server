import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CompletionRequest, CompletionItemKind, PublishDiagnosticsNotification, InsertTextFormat } from "vscode-languageserver";
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

  test("Value completion : completion should return cursor inside quotes for string", async () => {
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
      "name":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toEqual([
      {
        label: `""`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 13 }, end: { line: 2, character: 13 } },
          newText: ` "$1"`
        }
      }
    ]);
  });

  test("Value completion : completion should return cursor inside {} for object", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "object" }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toEqual([
      {
        label: `{}`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 13 }, end: { line: 2, character: 13 } },
          newText: ` {$0}`
        }
      }
    ]);
  });

  test("Value completion : completion should return cursor inside [] for array", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": { "type": "array" }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toEqual([
      {
        label: `[]`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 13 }, end: { line: 2, character: 13 } },
          newText: ` [$0]`
        }
      }
    ]);
  });
  test("Value completion : completion should return true & false for type Boolean", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "test": { "type": "boolean" }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "test":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 13 }
    });

    expect(completions).toEqual([
      {
        label: "true",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 13 }, end: { line: 2, character: 13 } },
          newText: " true"
        }
      },
      {
        label: "false",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 13 }, end: { line: 2, character: 13 } },
          newText: " false"
        }
      }
    ]);
  });

  test.skip("Value completion: selecting a property with const shows that tooltip", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": { "const": "foo" }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"foo"`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "foo"`
        }
      }
    ]);
  });

  test.skip("Value completion: shows enum suggestion for a property", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "enum": ["red", "green", "blue"] }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 16 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 16 } },
          newText: ` "red"`
        }
      },
      {
        label: `"green"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 16 } },
          newText: ` "green"`
        }
      },
      {
        label: `"blue"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 16 } },
          newText: ` "blue"`
        }
      }
    ]);
  });
});
