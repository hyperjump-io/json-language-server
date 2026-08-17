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

  // basic value types, const and enum
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

  test("Value completion: selecting a property with const shows that const value", async () => {
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

  test("Value completion: shows enum suggestion for a property", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "enum": ["red", null , 42] }
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
        label: `null`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 16 } },
          newText: ` null`
        }
      },
      {
        label: `42`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 16 } },
          newText: ` 42`
        }
      }
    ]);
  });

  // allOf tests
  test("allOf : value completion suggests common enum info from both allOf branch", async () => {
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "color": 
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
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      }
    ]);
  });

  test("allOf: value completion intersects compatible enum and type values from branches", async () => {
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
            "color": { "type": "string" }
          }
        },
        {
          "properties": {
            "color": { "enum": ["red", 42 , null] }
          }
        }
      ]
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      }
    ]);
  });

  test("allOf: value completion suggest nothing for incompatible 'enum' and 'type' values from branches", async () => {
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
            "color": { "type": "string" }
          }
        },
        {
          "properties": {
            "color": { "enum": [false, 42 , null] }
          }
        }
      ]
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([]);
  });

  test("allOf: value completion uses type when both branches declare the same type", async () => {
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "name": 
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 14 }
    });

    expect(completions).toEqual([
      {
        label: `""`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 13 }, end: { line: 2, character: 14 } },
          newText: ` "$1"`
        }
      }
    ]);
  });

  test("allOf: value completion suggests nothing for branches with conflicting types", async () => {
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "name":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 14 }
    });

    expect(completions).toEqual([]);
  });

  test("allOf: an 'allOf' nested inside allOf branch, processes its own branches then intersects with allOf", async () => {
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
            "color": { "enum": ["baz", "bar"] }
          }
        },
        {
          "allOf": [
            {
              "properties": {
                "color": { "enum": ["foo", "bar"] }
              }
            },
            {
              "properties": {
                "color": { "enum": ["foo", "baz"] }
              }
            }
          ]
        }
      ]
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([]);
  });

  test("allOf: an 'anyOf' nested inside allOf branch, processes its own branches then intersects with allOf", async () => {
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
            "color": { "enum": ["red", "blue"] }
          }
        },
        {
          "anyOf": [
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "color":
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
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"blue"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "blue"`
        }
      }
    ]);
  });

  test("allOf: an 'oneOf' nested inside allOf branch, processes its own branches then intersects with allOf", async () => {
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "color":
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
        label: `"blue"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "blue"`
        }
      }
    ]);
  });

  // anyOf tests
  test("anyOf: offers union of 'types' before a discriminant is typed", async () => {
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
            "foo": { "const": "a" },
            "bar": { "type": "null" }
          },
          "required": ["foo"]
        },
        {
          "properties": {
            "foo": { "const": "b" },
            "bar": { "type": "string" }
          },
          "required": ["foo"]
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "bar": 
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
        label: `null`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 12 }, end: { line: 2, character: 13 } },
          newText: ` null`
        }
      },
      {
        label: `""`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 12 }, end: { line: 2, character: 13 } },
          newText: ` "$1"`
        }
      }
    ]);
  });

  test("anyOf: offers union of 'enum' before a discriminant is typed", async () => {
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
            "color": { "enum": ["red", "amber"] }
          }
        },
        {
          "properties": {
            "color": { "enum": ["green", "blue"] }
          }
        }
      ]
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"amber"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "amber"`
        }
      },
      {
        label: `"green"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "green"`
        }
      },
      {
        label: `"blue"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "blue"`
        }
      }
    ]);
  });

  test("anyOf: offers union of 'const' values before a discriminant is typed", async () => {
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
            "kind": { "const": "a" }
          }
        },
        {
          "properties": {
            "kind": { "const": "b" }
          }
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "kind":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 14 }
    });

    expect(completions).toEqual([
      {
        label: `"a"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 13 }, end: { line: 2, character: 14 } },
          newText: ` "a"`
        }
      },
      {
        label: `"b"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 13 }, end: { line: 2, character: 14 } },
          newText: ` "b"`
        }
      }
    ]);
  });

  test("anyOf: an 'allOf' nested inside an 'anyOf' branch, first intersected then unioned", async () => {
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "color":
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
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"black"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "black"`
        }
      }
    ]);
  });

  test("anyOf: value completion after a discriminant is typed", async () => {
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "foo": "a",
      "bar": 
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 13 }
    });

    expect(completions).toEqual([
      {
        label: `"foo"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 3, character: 12 }, end: { line: 3, character: 13 } },
          newText: ` "foo"`
        }
      },
      {
        label: `"bar"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 3, character: 12 }, end: { line: 3, character: 13 } },
          newText: ` "bar"`
        }
      }
    ]);
  });

  // oneOf Tests
  test("oneOf: completion unions enum values from every branch before a discriminant is typed", async () => {
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
            "color": { "enum": ["red", "amber"] }
          }
        },
        {
          "properties": {
            "color": { "enum": ["green", "blue"] }
          }
        }
      ]
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"amber"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "amber"`
        }
      },
      {
        label: `"green"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "green"`
        }
      },
      {
        label: `"blue"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "blue"`
        }
      }
    ]);
  });

  test("oneOf: Symmetric-difference, a value offered by more than one branch is dropped", async () => {
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
            "color": { "enum": ["red", "amber"] }
          }
        },
        {
          "properties": {
            "color": { "enum": ["amber", "blue"] }
          }
        }
      ]
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"blue"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "blue"`
        }
      }
    ]);
  });

  test("oneOf: Symmetric-difference, but with odd number of branches", async () => {
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
            "color": { "enum": ["red", "amber"] }
          }
        },
        {
          "properties": {
            "color": { "enum": ["amber", "blue"] }
          }
        },
        {
          "properties": {
            "color": { "enum": ["amber", "pink"] }
          }
        }
      ]
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"blue"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "blue"`
        }
      },
      {
        label: `"pink"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "pink"`
        }
      }
    ]);
  });

  test("oneOf: value completion offers both branches' const values", async () => {
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
            "kind": { "const": "a" }
          }
        },
        {
          "properties": {
            "kind": { "const": "b" }
          }
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "kind":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 14 }
    });

    expect(completions).toEqual([
      {
        label: `"a"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 13 }, end: { line: 2, character: 14 } },
          newText: ` "a"`
        }
      },
      {
        label: `"b"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 13 }, end: { line: 2, character: 14 } },
          newText: ` "b"`
        }
      }
    ]);
  });

  test("oneOf: value completion narrows to a single branch once the discriminant is typed", async () => {
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
            "bar": { "enum": ["baz", "bar"] }
          },
          "required": ["foo"]
        },
        {
          "properties": {
            "foo": { "const": "b" },
            "bar": { "enum": ["qwe", "abc"] }
          },
          "required": ["foo"]
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "foo": "a",
      "bar":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 13 }
    });

    expect(completions).toEqual([
      {
        label: `"baz"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 3, character: 12 }, end: { line: 3, character: 13 } },
          newText: ` "baz"`
        }
      },
      {
        label: `"bar"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 3, character: 12 }, end: { line: 3, character: 13 } },
          newText: ` "bar"`
        }
      }
    ]);
  });

  test("oneOf + allOf: an allOf alongside a oneOf filters the unioned values by type", async () => {
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
            "color": { "type": "string" }
          }
        }
      ],
      "oneOf": [
        {
          "properties": {
            "color": { "enum": ["red", 42] }
          }
        },
        {
          "properties": {
            "color": { "enum": ["blue", null] }
          }
        }
      ]
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"blue"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "blue"`
        }
      }
    ]);
  });

  test("oneOf + allOf: an allOf inside a oneOf branch is intersected, not flattened into the union", async () => {
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "color":
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
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"black"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "black"`
        }
      }
    ]);
  });

  // not keyword Tests
  test("not: excludes a single const value", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": {
          "enum": ["red", "green", "blue"],
          "not": { "const": "green" }
        }
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"blue"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "blue"`
        }
      }
    ]);
  });

  test("not: excludes every value listed in a 'not' enum", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": {
          "enum": ["red", "green", "blue", "yellow"],
          "not": { "enum": ["green", "blue"] }
        }
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"yellow"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "yellow"`
        }
      }
    ]);
  });

  test("not: excludes true from a boolean property's completions", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "allowConnection": {
          "type": "boolean",
          "not": { "const": true }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "allowConnection": 
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 25 }
    });

    expect(completions).toEqual([
      {
        label: "false",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 24 }, end: { line: 2, character: 25 } },
          newText: " false"
        }
      }
    ]);
  });

  test("not + allOf: a 'not' in any branch excludes an enum value from the intersected result", async () => {
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
            "color": { "enum": ["red", "green", "blue"] }
          }
        },
        {
          "properties": {
            "color": { "enum": ["blue", "red"] }
          }
        },
        {
          "properties": {
            "color": { "not": { "const": "blue" } }
          }
        }
      ]
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      }
    ]);
  });

  test("not + anyOf: a value stays offered unless EVERY branch excludes it", async () => {
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
            "runner": {
              "enum": ["linux", "windows", "mac"],
              "not": { "const": "linux" }
            }
          }
        },
        {
          "properties": {
            "runner": {
              "enum": ["linux", "windows"],
              "not": { "const": "windows" }
            }
          }
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "runner": 
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
        label: `"windows"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 15 }, end: { line: 2, character: 16 } },
          newText: ` "windows"`
        }
      },
      {
        label: `"mac"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 15 }, end: { line: 2, character: 16 } },
          newText: ` "mac"`
        }
      },
      {
        label: `"linux"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 15 }, end: { line: 2, character: 16 } },
          newText: ` "linux"`
        }
      }
    ]);
  });

  test("not: a 'not' on a const has no effect on a type's completion, when type is general", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "not": { "const": "foo" }
        }
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

  test("not + oneOf: a 'not' in one branch narrows completion values before symmetric-difference", async () => {
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "color":
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
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      },
      {
        label: `"yellow"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "yellow"`
        }
      }
    ]);
  });

  test("not + oneOf: enum values are filtered by type and 'not', then unioned", async () => {
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "level":
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
        label: `"warn"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "warn"`
        }
      },
      {
        label: `"trace"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "trace"`
        }
      }
    ]);
  });

  test("not: excludes a type from the property's own type array", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": ["string", "number"],
          "not": { "type": "string" }
        }
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
        label: "number",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` $0`
        }
      }
    ]);
  });

  test("not + allOf: a 'not' type in one branch narrows the type array declared in another", async () => {
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
        label: `""`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "$1"`
        }
      },
      {
        label: "number",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: " $0"
        }
      }
    ]);
  });

  // additionalProperties Tests
  test("additionalProperties: value completion for a property not covered by 'properties'", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "version": { "type": "number" }
      },
      "additionalProperties": { "enum": ["read", "write"] }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "access": 
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
        label: `"read"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 15 }, end: { line: 2, character: 16 } },
          newText: ` "read"`
        }
      },
      {
        label: `"write"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 15 }, end: { line: 2, character: 16 } },
          newText: ` "write"`
        }
      }
    ]);
  });

  test("additionalProperties: narrowing when oneOf branches", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "version": "web",
      "darkmode": 
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 18 }
    });

    expect(completions).toEqual([
      {
        label: "true",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 3, character: 17 }, end: { line: 3, character: 18 } },
          newText: " true"
        }
      },
      {
        label: "false",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 3, character: 17 }, end: { line: 3, character: 18 } },
          newText: " false"
        }
      }
    ]);
  });

  test("additionalProperties: no completion could be given because both alternatives get filtered.", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "version": "web",
      "rollout": {},
      "darkmode": 
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 18 }
    });

    expect(completions).toEqual([]);
  });

  // if / then / else Tests
  test("if/then: 'then' applies when the 'if' condition is true", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "shape": "circle",
      "radius":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: "number",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 3, character: 15 }, end: { line: 3, character: 15 } },
          newText: " $0"
        }
      }
    ]);
  });

  test("if/else: 'else' applies when the 'if' condition isn't true", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "shape": "square",
      "radius":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `""`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 3, character: 15 }, end: { line: 3, character: 15 } },
          newText: ` "$1"`
        }
      }
    ]);
  });

  // combinators inside the property's own schema, rather than at the root level
  test("anyOf: an unconstrained branch in one variant offers its value plus every basic type", async () => {
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
        label: `"auto"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "auto"`
        }
      },
      {
        label: `"off"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "off"`
        }
      },
      {
        label: `""`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "$1"`
        }
      },
      {
        label: "number",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: " $0"
        }
      },
      {
        label: "true",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: " true"
        }
      },
      {
        label: "false",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: " false"
        }
      },
      {
        label: "null",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: " null"
        }
      },
      {
        label: "{}",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: " {$0}"
        }
      },
      {
        label: "[]",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: " [$0]"
        }
      },
      {
        label: "integer",
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: " $0"
        }
      }
    ]);
  });

  test("a combinator inside a property's own schema UNIONS its branches", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "format":
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
        label: `"uri"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 15 }, end: { line: 2, character: 15 } },
          newText: ` "uri"`
        }
      },
      {
        label: `"ipv4"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 15 }, end: { line: 2, character: 15 } },
          newText: ` "ipv4"`
        }
      },
      {
        label: `"email"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 15 }, end: { line: 2, character: 15 } },
          newText: ` "email"`
        }
      },
      {
        label: `"date"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 15 }, end: { line: 2, character: 15 } },
          newText: ` "date"`
        }
      },
      {
        label: `""`,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 15 }, end: { line: 2, character: 15 } },
          newText: ` "$1"`
        }
      }
    ]);
  });

  test("a combinator inside a property's own schema INTERSECTS its branches", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
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

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "color":
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 14 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 14 } },
          newText: ` "red"`
        }
      },
      {
        label: `"green"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 14 } },
          newText: ` "green"`
        }
      }
    ]);
  });

  // TODO: implement filtering keywords (minLength, maximum, minimum etc)
  test.skip("anyOf + allOf: an outer type constraint filters the union of anyOf enum values", async () => {
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
            "color": { "type": "string", "maxLength": 3 }
          }
        }
      ],
      "anyOf": [
        {
          "properties": {
            "color": { "enum": ["red", 42] }
          }
        },
        {
          "properties": {
            "color": { "enum": ["blue", null] }
          }
        }
      ]
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
      position: { line: 2, character: 15 }
    });

    expect(completions).toEqual([
      {
        label: `"red"`,
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: { start: { line: 2, character: 14 }, end: { line: 2, character: 15 } },
          newText: ` "red"`
        }
      }
    ]);
  });
});
