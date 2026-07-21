import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../test/TestClient.ts";
import { FoldingRangeRequest } from "vscode-languageserver";

describe("FoldingRanges", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("should return folding ranges for multi-line JSON objects", async () => {
    await client.writeDocument(
      "test.json",
      "{\n  \"foo\": \"bar\",\n  \"baz\": 123\n}\n"
    );
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).to.eql([
      {
        startLine: 0,
        endLine: 3
      }
    ]);
  });

  test("should return folding ranges for multi-line JSON arrays", async () => {
    await client.writeDocument(
      "test.json",
      "[\n  \"a\",\n  \"b\"\n]\n"
    );
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).to.eql([
      {
        startLine: 0,
        endLine: 3
      }
    ]);
  });

  test("should return folding ranges for nested objects and arrays", async () => {
    await client.writeDocument(
      "test.json",
      "{\n  \"a\": {\n    \"b\": [\n      1,\n      2\n    ]\n  }\n}\n"
    );
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).to.eql([
      {
        startLine: 0,
        endLine: 7
      },
      {
        startLine: 1,
        endLine: 6
      },
      {
        startLine: 2,
        endLine: 5
      }
    ]);
  });

  test("should not return folding ranges for single-line objects or arrays", async () => {
    await client.writeDocument("test.json", "{ \"a\": [1, 2] }\n");
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).to.eql([]);
  });

  test("should return folding ranges for multiple objects inside an array", async () => {
    await client.writeDocument(
      "test.json",
      "[\n  {\n    \"id\": 1\n  },\n  {\n    \"id\": 2\n  }\n]\n"
    );
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).to.eql([
      {
        startLine: 0,
        endLine: 7
      },
      {
        startLine: 1,
        endLine: 3
      },
      {
        startLine: 4,
        endLine: 6
      }
    ]);
  });

  test("should return folding ranges for empty multi-line objects", async () => {
    await client.writeDocument("test.json", "{\n}\n");
    const uri = await client.openDocument("test.json");

    const result = await client.sendRequest(FoldingRangeRequest.type, {
      textDocument: { uri }
    });

    expect(result).to.eql([
      {
        startLine: 0,
        endLine: 1
      }
    ]);
  });
});
