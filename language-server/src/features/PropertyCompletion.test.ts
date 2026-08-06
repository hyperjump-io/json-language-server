import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CompletionRequest, CompletionItemKind, PublishDiagnosticsNotification } from "vscode-languageserver";
import { TestClient } from "../test/TestClient.ts";

import type { CompletionItem } from "vscode-languageserver";

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

    expect(labels(completions)).toEqual([]);
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

    expect(labels(completions)).toEqual([
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
      position: { line: 3, character: 9 }
    });

    expect(labels(completions)).toEqual([
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

    expect(labels(completions)).toEqual([
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

    expect(labels(completions)).toEqual([
      { label: "foo", kind: CompletionItemKind.Property },
      { label: "bar", kind: CompletionItemKind.Property },
      { label: "baz", kind: CompletionItemKind.Property }
    ]);
  });

  test("allOf: does not drop property just because some property fails", async () => {
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
            "foo": { "type": "string", "minLength": 3 },
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

    expect(labels(completions)).toEqual([
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

    expect(labels(completions)).toEqual([
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

    expect(labels(completions)).toEqual([
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

    expect(labels(completions)).toEqual([
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

    expect(labels(completions)).toEqual([
      { label: "bar", kind: CompletionItemKind.Property }
    ]);
  });

  test("completion shows other properties when a single-branch schema has one invalid property", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "bar": { "type": "string" },
        "baz": { "type": "string" }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "bar": 42,
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(labels(completions)).toEqual([
      { label: "baz", kind: CompletionItemKind.Property }
    ]);
  });

  test("completion shows other properties when no oneOf branch fully matches", async () => {
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
            "bar": { "type": "string" },
            "baz": { "type": "string" }
          }
        },
        {
          "properties": {
            "foo": { "const": "b" },
            "qux": { "type": "string" }
          }
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "foo": "a",
      "bar": 42,
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 7 }
    });

    expect(labels(completions)).toEqual([
      { label: "baz", kind: CompletionItemKind.Property }
    ]);
  });

  test("oneOf: suggests the remaining required property of the branch already selected by a discriminator", async () => {
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
            "bar": { "type": "string" },
            "baz": { "type": "string" }
          },
          "required": ["foo", "bar", "baz"]
        },
        {
          "properties": {
            "foo": { "const": "b" },
            "qux": { "type": "string" }
          },
          "required": ["foo", "qux"]
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "foo": "a",
      "bar": "b",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 7 }
    });

    expect(labels(completions)).toEqual([
      { label: "baz", kind: CompletionItemKind.Property }
    ]);
  });

  test("oneOf: suggests required properties from all branches when the instance matches none", async () => {
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
            "a": { "type": "string" }
          },
          "required": ["a"]
        },
        {
          "properties": {
            "b": { "type": "string" }
          },
          "required": ["b"]
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "c": "",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(labels(completions)).toEqual([
      { label: "a", kind: CompletionItemKind.Property },
      { label: "b", kind: CompletionItemKind.Property }
    ]);
  });

  test("oneOf: suggests missing required properties from both branches when the existing property fits both", async () => {
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
            "foo": { "const": "a" },
            "a": { "type": "string" }
          },
          "required": ["foo", "a"]
        },
        {
          "type": "object",
          "properties": {
            "c": { "type": "boolean" }
          },
          "required": ["c"],
          "additionalProperties": {
            "type": "string"
          }
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "a": "",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(labels(completions)).toEqual([
      { label: "foo", kind: CompletionItemKind.Property },
      { label: "c", kind: CompletionItemKind.Property }
    ]);
  });

  test("oneOf: suggests nothing when the only matching branch is already complete i.e additionalProperties is false", async () => {
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
            "foo": { "const": "x" },
            "a": { "type": "number" }
          },
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "c": { "type": "boolean" }
          },
          "additionalProperties": false
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "foo": "x",
      "a": 42,
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 7 }
    });

    expect(labels(completions)).toEqual([]);
  });

  test("patternProperties: suggests only the properties declared by properties", async () => {
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
      },
      "patternProperties": {
        "^x_": { "type": "string" }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "x_1": "a",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(labels(completions)).toEqual([
      { label: "name", kind: CompletionItemKind.Property }
    ]);
  });

  test("patternProperties: narrows to the branch where the pattern matched property is valid", async () => {
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
            "a": { "type": "string" }
          },
          "patternProperties": {
            "^x_": { "type": "string" }
          }
        },
        {
          "properties": {
            "b": { "type": "string" }
          },
          "patternProperties": {
            "^x_": { "type": "number" }
          }
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "x_1": "a",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(labels(completions)).toEqual([
      { label: "a", kind: CompletionItemKind.Property }
    ]);
  });

  test("patternProperties: keeps every branch when the pattern matched property is valid in none", async () => {
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
            "a": { "type": "string" }
          },
          "patternProperties": {
            "^x_": { "type": "string" }
          }
        },
        {
          "properties": {
            "b": { "type": "string" }
          },
          "patternProperties": {
            "^x_": { "type": "number" }
          }
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "x_1": true,
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(labels(completions)).toEqual([
      { label: "a", kind: CompletionItemKind.Property },
      { label: "b", kind: CompletionItemKind.Property }
    ]);
  });

  test("not: suggests a property declared inside 'not' since that key can still appear", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "foo": { "type": "string" }
      },
      "not": {
        "properties": {
          "bar": { "type": "string" }
        }
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

    expect(labels(completions)).toEqual([
      { label: "bar", kind: CompletionItemKind.Property },
      { label: "foo", kind: CompletionItemKind.Property }
    ]);
  });

  test("required properties are suggested even if they aren't declared", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "required": ["foo"]
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

    expect(labels(completions)).toEqual([
      { label: "foo", kind: CompletionItemKind.Property }
    ]);
  });

  test("nested not: even number of 'not' should have no effect on completion", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "foo": { "type": "string" }
      },
      "not": {
        "not": {
          "required": ["bar"] 
        }
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

    expect(labels(completions)).toEqual([
      { label: "bar", kind: CompletionItemKind.Property },
      { label: "foo", kind: CompletionItemKind.Property }
    ]);
  });

  test("not: a forbidden property that is not declared should never be suggested", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "foo": { "type": "string" }
      },
      "not": { "required": ["bar"] }
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

    expect(labels(completions)).toEqual([
      { label: "foo", kind: CompletionItemKind.Property }
    ]);
  });

  test("not: Having just one property alone is fine, having neither is fine but having both together is forbidden", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "a": { "type": "string" },
        "b": { "type": "string" }
      },
      "not": { "required": ["a", "b"] }
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

    expect(labels(completions)).toEqual([
      { label: "a", kind: CompletionItemKind.Property },
      { label: "b", kind: CompletionItemKind.Property }
    ]);
  });

  test("not: should NOT suggest the other property if one of the mutually exclusive pair is present", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "a": { "type": "string" },
        "b": { "type": "string" }
      },
      "not": { "required": ["a", "b"] }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "a": "x",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(labels(completions)).toEqual([]);
  });

  test("not: excludes required properties wrapped in an anyOf branch", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "a": { "type": "string" },
        "b": { "type": "string" }
      },
      "not": {
        "anyOf": [
          { "required": ["a"] },
          { "required": ["b"] }
        ]
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

    expect(labels(completions)).toEqual([]);
  });

  test("not: excludes required properties wrapped in a oneOf branch", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "a": { "type": "string" },
        "b": { "type": "string" }
      },
      "not": {
        "oneOf": [
          { "required": ["a"] },
          { "required": ["b"] }
        ]
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

    expect(labels(completions)).toEqual([]);
  });

  test("anyOf: omits a candidate property whose type would violate the additionalProperties constraint of a compatible branch", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "foo": { "const": "x" },
            "a": { "type": "number" }
          },
          "required": ["foo", "a"]
        },
        {
          "type": "object",
          "properties": {
            "c": { "type": "boolean" }
          },
          "required": ["c"],
          "additionalProperties": {
            "type": "string"
          }
        }
      ]
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "a": "",
      ""
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 7 }
    });

    expect(labels(completions)).toEqual([
      { label: "c", kind: CompletionItemKind.Property }
    ]);
  });
});

const labels = (completions: CompletionItem[] | { items: CompletionItem[] } | null) => {
  const items = Array.isArray(completions) ? completions : completions?.items ?? [];
  return items.map((item) => ({ label: item.label, kind: item.kind }));
};
