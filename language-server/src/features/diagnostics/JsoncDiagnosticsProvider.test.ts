import { describe, test, expect, afterEach, beforeEach } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver";
import { TestClient } from "../../test/TestClient.ts";

describe("JSONC Diagnostics", () => {
  let client: TestClient;
  let fixtureSchemaUri: string;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("comments are reported as errors in JSON files", async () => {
    await client.writeDocument("instance.json", `{
      "a": 1 // hi
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: DiagnosticSeverity.Error,
        message: "Comments are not allowed in JSON"
      })
    ]));
  });

  test("comments are not reported in JSONC files by default", async () => {
    await client.writeDocument("instance.jsonc", `{
      "a": 1 // hi
    }`);
    const diagnostics = client.getDiagnostics("instance.jsonc");
    await client.openDocument("instance.jsonc");

    const diags = await diagnostics;
    expect(diags.filter((d: any) => d.message === "Comments are not allowed in JSON")).toEqual([]);
  });

  test("trailing commas are reported as errors in JSON files", async () => {
    await client.writeDocument("instance.json", `{
      "a": 1,
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: DiagnosticSeverity.Error,
        message: "Trailing commas are not allowed"
      })
    ]));
  });

  test("trailing commas are reported as warnings in JSONC files by default", async () => {
    await client.writeDocument("instance.jsonc", `{
      "a": 1,
    }`);
    const diagnostics = client.getDiagnostics("instance.jsonc");
    await client.openDocument("instance.jsonc");

    await expect(diagnostics).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: DiagnosticSeverity.Warning,
        message: "Trailing commas are not allowed"
      })
    ]));
  });

  test("schema allowComments true ignores comments in JSON files", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "file:///schema.json",
      "allowComments": true,
      "type": "object",
      "properties": {
        "a": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": 1 // hi
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    const diags = await diagnostics;
    expect(diags.filter((d: any) => d.message === "Comments are not allowed in JSON")).toEqual([]);
  });

  test("schema allowComments false does not override default in JSON files", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "file:///schema.json",
      "allowComments": false,
      "type": "object",
      "properties": {
        "a": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": 1 // hi
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: "Comments are not allowed in JSON"
      })
    ]));
  });

  test("schema allowTrailingCommas true ignores trailing commas", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "file:///schema.json",
      "allowTrailingCommas": true,
      "type": "object",
      "properties": {
        "a": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": 1,
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    const diags = await diagnostics;
    expect(diags.filter((d: any) => d.message === "Trailing commas are not allowed")).toEqual([]);
  });

  test("schema allowsTrailingCommas (deprecated spelling) true ignores trailing commas", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "file:///schema.json",
      "allowsTrailingCommas": true,
      "type": "object",
      "properties": {
        "a": { "type": "number" }
      }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": 1,
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    const diags = await diagnostics;
    expect(diags.filter((d: any) => d.message === "Trailing commas are not allowed")).toEqual([]);
  });

  test("block comments are reported as errors in JSON files", async () => {
    await client.writeDocument("instance.json", `{\n      "a": 1 /* hi */ \n    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: DiagnosticSeverity.Error,
        message: "Comments are not allowed in JSON"
      })
    ]));
  });

  test("schema allowTrailingCommas false does not override default in JSON files", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{\n      "$schema": "https://json-schema.org/draft/2020-12/schema",\n      "$id": "file:///schema.json",\n      "allowTrailingCommas": false,\n      "type": "object",\n      "properties": {\n        "a": { "type": "number" }\n      }\n    }`);

    await client.writeDocument("instance.json", `{\n      "$schema": "${fixtureSchemaUri}",\n      "a": 1,\n    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        message: "Trailing commas are not allowed"
      })
    ]));
  });

  test("schema allowComments true in allOf ignores comments in JSON files", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{\n      "$schema": "https://json-schema.org/draft/2020-12/schema",\n      "$id": "file:///schema.json",\n      "allOf": [\n        { "allowComments": true }\n      ],\n      "type": "object",\n      "properties": {\n        "a": { "type": "number" }\n      }\n    }`);

    await client.writeDocument("instance.json", `{\n      "$schema": "${fixtureSchemaUri}",\n      "a": 1 // hi\n    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    const diags = await diagnostics;
    expect(diags.filter((d: any) => d.message === "Comments are not allowed in JSON")).toEqual([]);
  });

  test("schema allowComments true in a matching anyOf alternative doesn't ignore comments", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "anyOf": [
        { "allowComments": true }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": 1 // hi
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: DiagnosticSeverity.Error,
        message: "Comments are not allowed in JSON"
      })
    ]));
  });

  test("schema allowComments true in a matching then doesn't ignore comments", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "if": { "type": "object" },
      "then": { "allowComments": true }
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": 1 // hi
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: DiagnosticSeverity.Error,
        message: "Comments are not allowed in JSON"
      })
    ]));
  });

  test("schema allowTrailingCommas true in a matching anyOf alternative doesn't ignore trailing commas", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "anyOf": [
        { "allowTrailingCommas": true }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": 1,
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: DiagnosticSeverity.Error,
        message: "Trailing commas are not allowed"
      })
    ]));
  });

  test("schema allowComments true is used even if allOf sets allowComments false", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "allOf": [
        { "allowComments": false }
      ],
      "allowComments": true
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": 1 // hi
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    const diags = await diagnostics;
    expect(diags.filter((d: any) => d.message === "Comments are not allowed in JSON")).toEqual([]);
  });

  test("schema allowComments true is used even if a $ref sets allowComments false", async () => {
    await client.writeDocument("base.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "allowComments": false
    }`);
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$ref": "./base.json",
      "allowComments": true
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": 1 // hi
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    const diags = await diagnostics;
    expect(diags.filter((d: any) => d.message === "Comments are not allowed in JSON")).toEqual([]);
  });

  test("schema allowComments true in a later allOf entry is used", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "allOf": [
        { "allowComments": false },
        { "allowComments": true }
      ]
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": 1 // hi
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    const diags = await diagnostics;
    expect(diags.filter((d: any) => d.message === "Comments are not allowed in JSON")).toEqual([]);
  });

  test("schema allowTrailingCommas true doesn't allow a comma with no value before it", async () => {
    fixtureSchemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "allowTrailingCommas": true
    }`);

    await client.writeDocument("instance.json", `{
      "$schema": "${fixtureSchemaUri}",
      "a": [,]
    }`);
    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");

    await expect(diagnostics).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: DiagnosticSeverity.Error,
        message: "Expected a value"
      })
    ]));
  });
});
