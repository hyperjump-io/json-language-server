import { EOL } from "node:os";
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../test/TestClient.ts";

import type { TextEdit } from "vscode-languageserver";

describe("Formatting", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("should format JSON with spaces", async () => {
    const originalText = `{"foo":"bar"}`;
    await client.writeDocument("test.json", originalText);
    const uri = await client.openDocument("test.json");

    const result = (await client.sendRequest("textDocument/formatting", {
      textDocument: { uri: uri.toString() },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    })) as TextEdit[];

    expect(result).toBeDefined();
    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 1 }
        },
        newText: `${EOL}  `
      },
      {
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 7 }
        },
        newText: " "
      },
      {
        range: {
          start: { line: 0, character: 12 },
          end: { line: 0, character: 12 }
        },
        newText: EOL
      }
    ]);
  });

  test("should format JSON with tabs", async () => {
    const originalText = `{"foo":"bar"}`;
    await client.writeDocument("test.json", originalText);
    const uri = await client.openDocument("test.json");

    const result = (await client.sendRequest("textDocument/formatting", {
      textDocument: { uri: uri.toString() },
      options: {
        tabSize: 4,
        insertSpaces: false
      }
    })) as TextEdit[];

    expect(result).toBeDefined();
    expect(result).toBeDefined();
    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 1 }
        },
        newText: `${EOL}\t`
      },
      {
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 7 }
        },
        newText: " "
      },
      {
        range: {
          start: { line: 0, character: 12 },
          end: { line: 0, character: 12 }
        },
        newText: EOL
      }
    ]);
  });

  test("should preserve CRLF line endings when formatting a document with CRLF", async () => {
    const originalText = `{"foo":"bar"}\r\n`;
    await client.writeDocument("test.json", originalText);
    const uri = await client.openDocument("test.json");

    const result = (await client.sendRequest("textDocument/formatting", {
      textDocument: { uri: uri.toString() },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    })) as TextEdit[];

    expect(result).toBeDefined();
    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 1 }
        },
        newText: "\r\n  "
      },
      {
        range: {
          start: { line: 0, character: 7 },
          end: { line: 0, character: 7 }
        },
        newText: " "
      },
      {
        range: {
          start: { line: 0, character: 12 },
          end: { line: 0, character: 12 }
        },
        newText: "\r\n"
      },
      {
        range: {
          start: { line: 0, character: 13 },
          end: { line: 1, character: 0 }
        },
        newText: ""
      }
    ]);
  });

  test("should handle formatting invalid JSON documents gracefully", async () => {
    const originalText = `{"foo":`;
    await client.writeDocument("test.json", originalText);
    const uri = await client.openDocument("test.json");

    const result = (await client.sendRequest("textDocument/formatting", {
      textDocument: { uri: uri.toString() },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    })) as TextEdit[];

    expect(result).toBeDefined();
    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 1 },
          end: { line: 0, character: 1 }
        },
        newText: `${EOL}  `
      }
    ]);
  });

  test("should format JSON range", async () => {
    const originalText = `{"foo":"bar","baz":"qux"}`;
    await client.writeDocument("test.json", originalText);
    const uri = await client.openDocument("test.json");

    const result = (await client.sendRequest("textDocument/rangeFormatting", {
      textDocument: { uri: uri.toString() },
      range: {
        start: { line: 0, character: 13 },
        end: { line: 0, character: 24 }
      },
      options: {
        tabSize: 2,
        insertSpaces: true
      }
    })) as TextEdit[];

    expect(result).toBeDefined();
    expect(result).toEqual([
      {
        range: {
          start: { line: 0, character: 19 },
          end: { line: 0, character: 19 }
        },
        newText: " "
      }
    ]);
  });
});
