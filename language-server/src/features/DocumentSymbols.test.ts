import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../test/TestClient.ts";
import { DocumentSymbolRequest, SymbolKind } from "vscode-languageserver";

describe("DocumentSymbols", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("should return document symbols for flat JSON object", async () => {
    await client.writeDocument("test.json", `{
      "name": "Alice",
      "age": 30,
      "active": true,
      "address": null
    }`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(DocumentSymbolRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        name: "name",
        kind: SymbolKind.Property,
        range: {
          start: { line: 1, character: 6 },
          end: { line: 1, character: 12 }
        },
        selectionRange: {
          start: { line: 1, character: 6 },
          end: { line: 1, character: 12 }
        }
      },
      {
        name: "Alice",
        kind: SymbolKind.String,
        range: {
          start: { line: 1, character: 14 },
          end: { line: 1, character: 21 }
        },
        selectionRange: {
          start: { line: 1, character: 14 },
          end: { line: 1, character: 21 }
        }
      },
      {
        name: "age",
        kind: SymbolKind.Property,
        range: {
          start: { line: 2, character: 6 },
          end: { line: 2, character: 11 }
        },
        selectionRange: {
          start: { line: 2, character: 6 },
          end: { line: 2, character: 11 }
        }
      },
      {
        name: "30",
        kind: SymbolKind.Number,
        range: {
          start: { line: 2, character: 13 },
          end: { line: 2, character: 15 }
        },
        selectionRange: {
          start: { line: 2, character: 13 },
          end: { line: 2, character: 15 }
        }
      },
      {
        name: "active",
        kind: SymbolKind.Property,
        range: {
          start: { line: 3, character: 6 },
          end: { line: 3, character: 14 }
        },
        selectionRange: {
          start: { line: 3, character: 6 },
          end: { line: 3, character: 14 }
        }
      },
      {
        name: "true",
        kind: SymbolKind.Boolean,
        range: {
          start: { line: 3, character: 16 },
          end: { line: 3, character: 20 }
        },
        selectionRange: {
          start: { line: 3, character: 16 },
          end: { line: 3, character: 20 }
        }
      },
      {
        name: "address",
        kind: SymbolKind.Property,
        range: {
          start: { line: 4, character: 6 },
          end: { line: 4, character: 15 }
        },
        selectionRange: {
          start: { line: 4, character: 6 },
          end: { line: 4, character: 15 }
        }
      },
      {
        name: "null",
        kind: SymbolKind.Null,
        range: {
          start: { line: 4, character: 17 },
          end: { line: 4, character: 21 }
        },
        selectionRange: {
          start: { line: 4, character: 17 },
          end: { line: 4, character: 21 }
        }
      }
    ]);
  });

  test("should return document symbols for nested JSON objects", async () => {
    await client.writeDocument("test.json", `{
      "server": {
        "port": 8080
      }
    }`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(DocumentSymbolRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        name: "server",
        kind: SymbolKind.Property,
        range: {
          start: { line: 1, character: 6 },
          end: { line: 1, character: 14 }
        },
        selectionRange: {
          start: { line: 1, character: 6 },
          end: { line: 1, character: 14 }
        }
      },
      {
        name: "server",
        kind: SymbolKind.Object,
        range: {
          start: { line: 1, character: 16 },
          end: { line: 3, character: 7 }
        },
        selectionRange: {
          start: { line: 1, character: 16 },
          end: { line: 3, character: 7 }
        },
        children: [
          {
            name: "port",
            kind: SymbolKind.Property,
            range: {
              start: { line: 2, character: 8 },
              end: { line: 2, character: 14 }
            },
            selectionRange: {
              start: { line: 2, character: 8 },
              end: { line: 2, character: 14 }
            }
          },
          {
            name: "8080",
            kind: SymbolKind.Number,
            range: {
              start: { line: 2, character: 16 },
              end: { line: 2, character: 20 }
            },
            selectionRange: {
              start: { line: 2, character: 16 },
              end: { line: 2, character: 20 }
            }
          }
        ]
      }
    ]);
  });

  test("should return document symbols for JSON arrays", async () => {
    await client.writeDocument("test.json", `{
      "plugins": [
        "auth",
        "logger"
      ]
    }`);
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(DocumentSymbolRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        name: "plugins",
        kind: SymbolKind.Property,
        range: {
          start: { line: 1, character: 6 },
          end: { line: 1, character: 15 }
        },
        selectionRange: {
          start: { line: 1, character: 6 },
          end: { line: 1, character: 15 }
        }
      },
      {
        name: "plugins",
        kind: SymbolKind.Array,
        range: {
          start: { line: 1, character: 17 },
          end: { line: 4, character: 7 }
        },
        selectionRange: {
          start: { line: 1, character: 17 },
          end: { line: 4, character: 7 }
        },
        children: [
          {
            name: "0",
            kind: SymbolKind.String,
            range: {
              start: { line: 2, character: 8 },
              end: { line: 2, character: 14 }
            },
            selectionRange: {
              start: { line: 2, character: 8 },
              end: { line: 2, character: 14 }
            }
          },
          {
            name: "1",
            kind: SymbolKind.String,
            range: {
              start: { line: 3, character: 8 },
              end: { line: 3, character: 16 }
            },
            selectionRange: {
              start: { line: 3, character: 8 },
              end: { line: 3, character: 16 }
            }
          }
        ]
      }
    ]);
  });

  test("should return empty array for empty JSON object or empty array root", async () => {
    await client.writeDocument("test.json", "{}\n");
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(DocumentSymbolRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });
});
