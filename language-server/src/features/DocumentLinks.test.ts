import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { DocumentLinkRequest, PublishDiagnosticsNotification } from "vscode-languageserver";
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

  test("should resolve a plain JSON Pointer $ref", async () => {
    await client.writeDocument("schema.json", `{
      "definitions": {
        "foo": { "type": "string" }
      },
      "properties": {
        "bar": { "$ref": "#/definitions/foo" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 5, character: 26 }, end: { line: 5, character: 43 } },
        target: `${uri}#3,16`
      }
    ]);
  });

  test("should resolve a $ref to the whole document", async () => {
    await client.writeDocument("schema.json", `{
      "properties": {
        "self": { "$ref": "#" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 2, character: 27 }, end: { line: 2, character: 28 } },
        target: `${uri}#1,1`
      }
    ]);
  });

  test("should resolve a $anchor reference", async () => {
    await client.writeDocument("schema.json", `{
      "definitions": {
        "foo": { "$anchor": "fooAnchor", "type": "string" }
      },
      "properties": {
        "bar": { "$ref": "#fooAnchor" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 5, character: 26 }, end: { line: 5, character: 36 } },
        target: `${uri}#3,16`
      }
    ]);
  });

  test("should resolve a legacy $id anchor reference (\"$id\": \"#name\")", async () => {
    await client.writeDocument("schema.json", `{
      "definitions": {
        "foo": { "$id": "#fooAnchor", "type": "string" }
      },
      "properties": {
        "bar": { "$ref": "#fooAnchor" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 5, character: 26 }, end: { line: 5, character: 36 } },
        target: `${uri}#3,16`
      }
    ]);
  });

  test("should resolve a $ref to an embedded schema by $id (no fragment)", async () => {
    await client.writeDocument("schema.json", `{
      "definitions": {
        "foo": { "$id": "sub-schema", "type": "string" }
      },
      "properties": {
        "bar": { "$ref": "sub-schema" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 5, character: 26 }, end: { line: 5, character: 36 } },
        target: `${uri}#3,16`
      }
    ]);
  });

  test("should resolve a $ref to an embedded schema by $id with a JSON Pointer fragment", async () => {
    await client.writeDocument("schema.json", `{
      "definitions": {
        "foo": {
          "$id": "sub-schema",
          "properties": {
            "x": { "type": "number" }
          }
        }
      },
      "properties": {
        "bar": { "$ref": "sub-schema#/properties/x" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 10, character: 26 }, end: { line: 10, character: 50 } },
        target: `${uri}#6,18`
      }
    ]);
  });

  test("should resolve a $ref to an embedded schema by $id with an anchor fragment", async () => {
    await client.writeDocument("schema.json", `{
      "definitions": {
        "foo": {
          "$id": "sub-schema",
          "properties": {
            "x": { "$anchor": "xAnchor", "type": "number" }
          }
        }
      },
      "properties": {
        "bar": { "$ref": "sub-schema#xAnchor" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 10, character: 26 }, end: { line: 10, character: 44 } },
        target: `${uri}#6,18`
      }
    ]);
  });

  test("should not emit a link for an unresolvable $ref", async () => {
    await client.writeDocument("schema.json", `{
      "properties": {
        "bar": { "$ref": "#/definitions/missing" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should return multiple links for multiple $refs", async () => {
    await client.writeDocument("schema.json", `{
      "definitions": {
        "foo": { "type": "string" },
        "bar": { "type": "number" }
      },
      "properties": {
        "a": { "$ref": "#/definitions/foo" },
        "b": { "$ref": "#/definitions/bar" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 6, character: 24 }, end: { line: 6, character: 41 } },
        target: `${uri}#3,16`
      },
      {
        range: { start: { line: 7, character: 24 }, end: { line: 7, character: 41 } },
        target: `${uri}#4,16`
      }
    ]);
  });

  test("should return an empty array when the document has no $ref", async () => {
    await client.writeDocument("schema.json", `{"type": "string"}`);
    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should resolve a $ref to a JSON Pointer fragment in a different, unopened file", async () => {
    const otherUri = await client.writeDocument("other.json", `{
      "properties": {
        "x": { "type": "number" }
      }
    }`);

    await client.writeDocument("schema.json", `{
      "properties": {
        "bar": { "$ref": "other.json#/properties/x" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 2, character: 26 }, end: { line: 2, character: 50 } },
        target: `${otherUri}#3,14`
      }
    ]);
  });

  test("should resolve a $ref to a different file using its live unsaved content when that file is open", async () => {
    const otherUri = await client.writeDocument("other.json", `{
      "properties": {
        "x": { "type": "number" }
      }
    }`);

    await client.openDocument("other.json");

    const otherDiagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === otherUri) {
          resolve();
        }
      });
    });

    await client.changeDocument("other.json", `{
      "properties": {
        "x": { "type": "number" },
        "y": { "type": "string" }
      }
    }`);

    await otherDiagnostics;

    await client.writeDocument("schema.json", `{
      "properties": {
        "bar": { "$ref": "other.json#/properties/y" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 2, character: 26 }, end: { line: 2, character: 50 } },
        target: `${otherUri}#4,14`
      }
    ]);
  });

  test("should follow a $ref chain across multiple files to the final non-$ref node", async () => {
    const cUri = await client.writeDocument("c.json", `{
      "definitions": {
        "leaf": { "type": "string" }
      }
    }`);

    await client.writeDocument("b.json", `{
      "definitions": {
        "middle": { "$ref": "c.json#/definitions/leaf" }
      }
    }`);

    await client.writeDocument("a.json", `{
      "properties": {
        "bar": { "$ref": "b.json#/definitions/middle" }
      }
    }`);

    const uri = await client.openDocument("a.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        range: { start: { line: 2, character: 26 }, end: { line: 2, character: 52 } },
        target: `${cUri}#3,17`
      }
    ]);
  });

  test("should not hang and should emit no link for a circular $ref chain", async () => {
    await client.writeDocument("b.json", `{
      "definitions": {
        "loop": { "$ref": "schema.json#/definitions/loop" }
      }
    }`);

    await client.writeDocument("schema.json", `{
      "definitions": {
        "loop": { "$ref": "b.json#/definitions/loop" }
      }
    }`);

    const uri = await client.openDocument("schema.json");

    const result = await client.sendRequest(DocumentLinkRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });
});
