import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { CompletionItem, CompletionItemKind, CompletionRequest } from "vscode-languageserver";
import { TestClient } from "../../test/TestClient.ts";

describe("Property completions", () => {
  let client: TestClient;
  let fixtureSchemaUri: string;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("completion returns no completions when there are no properties", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "object"
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toEqual([]);
  });

  test("completion returns properties", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "properties": {
            "name": { "type": "string" }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "name" }
    ]);
  });

  test("completion suggests a property literally named the empty string", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "properties": {
            "": { "type": "string" },
            "name": { "type": "string" }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "name" }
    ]);
  });

  test("completion kind", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "properties": {
            "name": { "type": "string" }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    }) as CompletionItem[];

    expect(completions[0].kind).toEqual(CompletionItemKind.Property);
  });

  test("completion filterText", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "properties": {
            "name": { "type": "string" }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    }) as CompletionItem[];

    expect(completions[0].filterText).toEqual(`"name"`);
  });

  test("completion textEdit", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "properties": {
            "name": { "type": "string" }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    }) as CompletionItem[];

    expect(completions[0].textEdit).toEqual({
      range: { start: { line: 3, character: 8 }, end: { line: 3, character: 10 } },
      newText: `"name": `
    });
  });

  test("completion returns properties for nested object", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "address": {
          ""
        }
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 11 }
    });

    expect(completions).toMatchObject([
      { label: "street" },
      { label: "city" },
      { label: "zipCode" }
    ]);
  });

  test("completion returns non duplicate properties across allOf", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "foo" },
      { label: "bar" },
      { label: "baz" }
    ]);
  });

  test("allOf: does not drop property just because some property fails", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "foo": "a",
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "bar" },
      { label: "baz" }
    ]);
  });

  test("completion returns the union across anyOf branches before a discriminant is typed", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "foo" },
      { label: "bar" },
      { label: "baz" }
    ]);
  });

  test("completion narrows completion for anyOf once the discriminant is typed", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "foo": 123,
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "bar" }
    ]);
  });

  test("completion returns properties from every oneOf branch before a discriminant is typed", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "object",
          "oneOf": [
            {
              "properties": {
                "foo": { "type": "string" },
                "bar": { "type": "string" }
              }
            },
            {
              "properties": {
                "foo": { "type": "string" },
                "baz": { "type": "string" }
              }
            }
          ]
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "bar" },
      { label: "baz" }
    ]);
  });

  test("completion narrows completion for oneOf once the discriminant is typed", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "foo": "a",
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "bar" }
    ]);
  });

  test("completion shows other properties when an existing property has an invalid value", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "object",
          "properties": {
            "bar": { "type": "string" },
            "baz": { "type": "string" }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "bar": 42,
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "baz" }
    ]);
  });

  test("completion shows other properties when no oneOf branch fully matches", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "object",
          "oneOf": [
            {
              "properties": {
                "foo": { "const": "a" },
                "bar": { "type": "string" },
                "baz": { "type": "string" }
              },
              "additionalProperties": false
            },
            {
              "properties": {
                "foo": { "const": "b" },
                "qux": { "type": "string" }
              },
              "additionalProperties": false
            }
          ]
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "foo": "a",
        "bar": 42,
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 5, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "baz" }
    ]);
  });

  test("oneOf: suggests the remaining required property of the branch already selected by a discriminator", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "foo": "a",
        "bar": "b",
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 5, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "baz" }
    ]);
  });

  test("oneOf: suggests required properties from all branches when the instance matches none", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "c": "",
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "a" },
      { label: "b" }
    ]);
  });

  test("oneOf: suggests missing required properties from both branches when the existing property fits both", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "a": "",
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "foo" },
      { label: "c" }
    ]);
  });

  test("oneOf: only offers the matching branch's own properties when additionalProperties is false", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "foo": "x",
        "a": 42,
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 5, character: 9 }
    });

    expect(completions).toMatchObject([]);
  });

  test("patternProperties: an existing pattern-matched property is suggested alongside declared properties", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "object",
          "properties": {
            "name": { "type": "string" }
          },
          "patternProperties": {
            "^x_": { "type": "string" }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "x_1": "a",
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "name" }
    ]);
  });

  test("patternProperties: narrows to the branch where the pattern matched property is valid", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "x_1": "a",
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "a" }
    ]);
  });

  test("patternProperties: keeps every branch when the pattern matched property is valid in none", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "x_1": true,
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "a" },
      { label: "b" }
    ]);
  });

  test("not: suggests a property declared inside 'not' since that key can still appear", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "object",
          "properties": {
            "foo": { "type": "string" }
          },
          "not": {
            "properties": {
              "bar": { "type": "string" }
            }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "foo" },
      { label: "bar" }
    ]);
  });

  test("nested not: even number of 'not' should have no effect on completion", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "object",
          "properties": {
            "foo": { "type": "string" }
          },
          "not": {
            "not": {
              "properties": {
                "bar": { "type": "string" }
              }
            }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "foo" },
      { label: "bar" }
    ]);
  });

  test("not: a property left with no valid values by negation is not suggested", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "object",
          "properties": {
            "foo": { "type": "string" }
          },
          "not": {
            "properties": {
              "bar": {}
            }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "foo" }
    ]);
  });

  test("completion suggests a property name containing a slash unescaped", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "properties": {
            "a/b": { "type": "string" },
            "c~d": { "type": "string" }
          }
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 3, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "a/b" },
      { label: "c~d" }
    ]);
  });

  test("anyOf: excludes a branch's properties when an existing value fails that branch's own type, even though another branch's additionalProperties would accept it", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
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
        }
      }
    }`);

    const instanceText = `{
      "$schema": "${fixtureSchemaUri}",
      "value": {
        "a": "",
        ""
      }
    }`;

    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 4, character: 9 }
    });

    expect(completions).toMatchObject([
      { label: "c" }
    ]);
  });

  test("completion returns no completions when the schema can't be loaded", async () => {
    await client.writeDocument("instance.json", `{
      "$schema": "./missing.json",
      ""
    }`);
    const uri = await client.openDocument("instance.json");

    const completions = await client.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 7 }
    });

    expect(completions).toEqual([]);
  });
});
