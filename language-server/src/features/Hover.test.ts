import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { HoverRequest, PublishDiagnosticsNotification } from "vscode-languageserver";
import { TestClient } from "../test/TestClient.ts";
import { unregisterSchema } from "@hyperjump/json-schema";

describe("Hover", () => {
  let client: TestClient;
  let fixtureSchemaUri: string;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  afterEach(() => {
    unregisterSchema(fixtureSchemaUri);
  });

  test("should return title and description on hover over a property value", async () => {
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
          "title": "Full Name",
          "description": "The full name of the person.",
          "type": "string"
        }
      }
    }`);

    const instanceText = `{\n  "$schema": "${fixtureSchemaUri}",\n  "name": "Alice"\n}`;
    await client.writeDocument("instance.json", instanceText);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 10 }
    });

    expect(result).toEqual({
      contents: {
        kind: "markdown",
        value: `**Full Name**

The full name of the person.

---

_hyperjump-json-language-server_`
      }
    });
  });

  test("should return null on hover when no schema is associated", async () => {
    await client.writeDocument("no-schema.json", `{"key": "value"}`);
    const uri = await client.openDocument("no-schema.json");

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 0, character: 8 }
    });

    expect(result).toBeNull();
  });

  test("should return null on hover over a property with no title or description", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "age": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{\n  "$schema": "${fixtureSchemaUri}",\n  "age": 30\n}`);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 8 }
    });

    expect(result).toBeNull();
  });

  test("should return only title when description is absent", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "status": {
          "title": "Status",
          "type": "string"
        }
      }
    }`);

    await client.writeDocument("instance.json", `{\n  "$schema": "${fixtureSchemaUri}",\n  "status": "active"\n}`);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 12 }
    });

    expect(result).toEqual({
      contents: {
        kind: "markdown",
        value: `**Status**

---

_hyperjump-json-language-server_`
      }
    });
  });

  test("should return only description when title is absent", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "status": {
          "description": "This is the Status",
          "type": "string"
        }
      }
    }`);

    await client.writeDocument("instance.json", `{\n  "$schema": "${fixtureSchemaUri}",\n  "status": "active"\n}`);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 12 }
    });

    expect(result).toEqual({
      contents: {
        kind: "markdown",
        value: `This is the Status

---

_hyperjump-json-language-server_`
      }
    });
  });

  test("should return null on hover in a document with JSON parse errors", async () => {
    await client.writeDocument("bad.json", `{"key": `);
    const uri = await client.openDocument("bad.json");

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 0, character: 4 }
    });

    expect(result).toBeNull();
  });

  test("Hover should drop annotations for failing schemas", async () => {
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
          "type": "number",
          "oneOf": [
            {
              "minimum": 50,
              "title": "Big number",
              "description": "i am a big number"
            },
            {
              "maximum": 10,
              "title": "Small number",
              "description": " i am a small number"
            }
          ]
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": 90
    }`);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 10 }
    });

    expect(result).toEqual({
      contents: {
        kind: "markdown",
        value: `**Big number**

i am a big number

---

_hyperjump-json-language-server_`
      }
    });
  });

  test("Hover should return all annotations if multiple are applicable at an instanceLocation", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument(
      "schema.json",
      `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value": {
          "type": "number",
          "title": "Number",
          "description": "i am a number",
          "allOf": [
            {
              "minimum": 50,
              "title": "Big number",
              "description": "i am a big number"
            }
          ]
        }
      }
    }`
    );

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": 90
    }`);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 10 }
    });

    expect(result).toEqual({
      contents: {
        kind: "markdown",
        value: `**Big number**

i am a big number

**Number**

i am a number

---

_hyperjump-json-language-server_`
      }
    });
  });

  test("should not duplicate annotations when the referenced schema is edited while the instance stays open", async () => {
    const initialValidation: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "age": {
          "title": "Title 1",
          "description": "Age of the user in years.",
          "type": "number"
        }
      }
    }`);

    await client.writeDocument("instance.json", `{\n  "$schema": "${fixtureSchemaUri}",\n  "age": 25\n}`);
    const uri = await client.openDocument("instance.json");

    await initialValidation;

    const secondValidation: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, (params) => {
        if (params.uri === uri) {
          resolve();
        }
      });
    });

    await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "age": {
          "title": "New Title",
          "description": "Age of the user in years.",
          "type": "number"
        }
      }
    }`);

    await secondValidation;

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 10 }
    });

    expect(result).toEqual({
      contents: {
        kind: "markdown",
        value: `**New Title**

Age of the user in years.

---

_hyperjump-json-language-server_`
      }
    });
  });

  test("if schema fails as a whole but a sub-schema passes then hover should return annotations for passing sub-schemas", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "properties": {
        "value1": {
          "type": "number",
          "title": "A Number"
        },
        "value2": {
          "type": "string",
          "title": "A string"
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value1": 90,
      "value2": 90
    }`);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 2, character: 10 }
    });

    expect(result).toEqual({
      contents: {
        kind: "markdown",
        value: `**A Number**

---

_hyperjump-json-language-server_`
      }
    });
  });

  test("hover with an invalid schema", async () => {
    const diagnostics: Promise<void> = new Promise((resolve) => {
      client.onNotification(PublishDiagnosticsNotification.type, () => {
        resolve();
      });
    });

    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "invalid",
      "properties": {
        "value": {
          "type": "invalid",
          "title": "A Number"
        }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "value": 90
    }`);
    const uri = await client.openDocument("instance.json");

    await diagnostics;

    const result = await client.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 1, character: 10 }
    });

    expect(result).toEqual(null);
  });
});
