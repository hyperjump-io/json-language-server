import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { DocumentColorRequest, ColorPresentationRequest } from "vscode-languageserver";
import { TestClient } from "../test/TestClient.ts";

describe("DocumentColors", () => {
  let client: TestClient;
  let fixtureSchemaUri: string;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("should return a color for a string with format color-hex", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "type": "string", "format": "color-hex" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color": "#ff0000"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        color: { red: 1, green: 0, blue: 0, alpha: 1 },
        range: {
          start: { line: 2, character: 15 },
          end: { line: 2, character: 24 }
        }
      }
    ]);
  });

  test("should expand shorthand hex colors", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "type": "string", "format": "color-hex" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color": "#0f0"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        color: { red: 0, green: 1, blue: 0, alpha: 1 },
        range: {
          start: { line: 2, character: 15 },
          end: { line: 2, character: 21 }
        }
      }
    ]);
  });

  test("should read the alpha channel from an 8 digit hex color", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "type": "string", "format": "color-hex" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color": "#0000ff80"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        color: { red: 0, green: 0, blue: 1, alpha: 128 / 255 },
        range: {
          start: { line: 2, character: 15 },
          end: { line: 2, character: 26 }
        }
      }
    ]);
  });

  test("should return a color when the schema uses an older dialect", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "color": { "type": "string", "format": "color-hex" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color": "#ff0000"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        color: { red: 1, green: 0, blue: 0, alpha: 1 },
        range: {
          start: { line: 2, character: 15 },
          end: { line: 2, character: 24 }
        }
      }
    ]);
  });

  test("should return a color when the schema uses the 2019-09 dialect", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2019-09/schema",
      "type": "object",
      "properties": {
        "color": { "type": "string", "format": "color-hex" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color": "#ff0000"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([
      {
        color: { red: 1, green: 0, blue: 0, alpha: 1 },
        range: {
          start: { line: 2, character: 15 },
          end: { line: 2, character: 24 }
        }
      }
    ]);
  });

  test("should not return a color when the schema doesn't declare format color-hex", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "type": "string" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color": "#ff0000"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should not return a color when the value isn't a valid hex color", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "color": { "type": "string", "format": "color-hex" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "color": "red"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should not return a color for a property key that matches a hex color", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "#ff0000": { "type": "string", "format": "color-hex" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "#ff0000": "not a color"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should return an empty list when no schema is associated", async () => {
    await client.writeDocument("no-schema.json", `{
      "color": "#ff0000"
    }`);
    const uri = await client.openDocument("no-schema.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should return an empty list for a document with JSON parse errors", async () => {
    await client.writeDocument("bad.json", `{"color": `);
    const uri = await client.openDocument("bad.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });

  test("should present an opaque color as a quoted six digit hex string", async () => {
    await client.writeDocument("instance.json", `{
      "color": "#000000"
    }`);
    const uri = await client.openDocument("instance.json");

    const range = {
      start: { line: 1, character: 15 },
      end: { line: 1, character: 24 }
    };

    const result = await client.sendRequest(ColorPresentationRequest.type, {
      textDocument: { uri },
      color: { red: 1, green: 0.5, blue: 0, alpha: 1 },
      range
    });

    expect(result).toEqual([
      {
        label: "#ff8000",
        textEdit: { range, newText: `"#ff8000"` }
      }
    ]);
  });

  test("should include the alpha channel in the presentation when alpha is less than 1", async () => {
    await client.writeDocument("instance.json", `{
      "color": "#000000"
    }`);
    const uri = await client.openDocument("instance.json");

    const range = {
      start: { line: 1, character: 15 },
      end: { line: 1, character: 24 }
    };

    const result = await client.sendRequest(ColorPresentationRequest.type, {
      textDocument: { uri },
      color: { red: 0, green: 0, blue: 1, alpha: 128 / 255 },
      range
    });

    expect(result).toEqual([
      {
        label: "#0000ff80",
        textEdit: { range, newText: `"#0000ff80"` }
      }
    ]);
  });

  test("should return no colors when the schema can't be loaded", async () => {
    await client.writeDocument("instance.json", `{
      "$schema": "./missing.json",
      "color": "#ff0000"
    }`);
    const uri = await client.openDocument("instance.json");

    const result = await client.sendRequest(DocumentColorRequest.type, {
      textDocument: { uri }
    });

    expect(result).toEqual([]);
  });
});
