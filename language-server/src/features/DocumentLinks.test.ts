import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { DocumentLinkRequest } from "vscode-languageserver";
import { TestClient } from "../test/TestClient.ts";

describe("DocumentLinks", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("should return a link for a $schema that resolves to a schema file in the workspace", async () => {
    const schemaUri = await client.writeDocument("schema.json", `{
      "type": "object"
    }`);

    const instanceUri = await client.writeDocument("instance.json", `{
      "$schema": "./schema.json"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(uri).toBe(instanceUri);
    expect(result).toEqual([
      {
        target: schemaUri,
        tooltip: "Click to open schema file",
        range: {
          start: { line: 1, character: 18 },
          end: { line: 1, character: 31 }
        }
      }
    ]);
  });

  test("should not return a link for a $schema resolved from SchemaStore.org", async () => {
    await client.writeDocument("instance.json", `{
      "$schema": "https://json.schemastore.org/package.json"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should not return a link when $schema resolves outside the workspace", async () => {
    await client.writeDocument("instance.json", `{
      "$schema": "../../schema.json"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should return an empty array when the document has no $schema", async () => {
    await client.writeDocument("instance.json", `{"type": "string"}`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should not treat a nested $schema property as the document's dialect schema", async () => {
    await client.writeDocument("instance.json", `{
      "properties": {
        "$schema": { "type": "string" }
      }
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });
});
