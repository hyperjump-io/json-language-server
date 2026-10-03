import { describe, test, expect, afterEach } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver";
import { TestClient } from "../../test/TestClient.ts";

const schemaId = "https://example.com/duplicate-schema";

const schemaWithId = (id: string, type: string) => `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "${id}",
  "type": "object",
  "properties": {
    "foo": { "type": "${type}" }
  }
}`;

describe("Schema registration", () => {
  let client: TestClient;

  afterEach(async () => {
    await client.stop();
  });

  test("a duplicate identifier is an error on $id and a warning on documents that use it", async () => {
    client = new TestClient();
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "string"));
    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    await client.start();

    const initialDiagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialDiagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a string" })
    ]);

    const instanceDiagnostics = client.getDiagnostics("instance.json");
    const bSchemaUri = await client.writeDocument("b-schema.json", schemaWithId(schemaId, "number"));
    await expect(instanceDiagnostics).resolves.toEqual([
      {
        message: `Ambiguous schema identifier. '${bSchemaUri}' also uses the identifier '${schemaId}'`,
        range: {
          start: { line: 1, character: 17 },
          end: { line: 1, character: 19 + schemaId.length }
        },
        severity: DiagnosticSeverity.Warning,
        source: "hyperjump-json-language-server"
      },
      expect.objectContaining({ message: "Expected a string" })
    ]);

    const bDiagnostics = client.getDiagnostics("b-schema.json");
    await client.openDocument("b-schema.json");
    await expect(bDiagnostics).resolves.toEqual([
      {
        message: expect.stringContaining(`A schema has already been registered for '${schemaId}`) as string,
        range: {
          start: { line: 2, character: 9 },
          end: { line: 2, character: 11 + schemaId.length }
        },
        severity: DiagnosticSeverity.Error,
        source: "hyperjump-json-language-server"
      }
    ]);
  });

  test("a duplicate identifier is a warning on the registered schema's $id", async () => {
    client = new TestClient();
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "string"));
    await client.start();

    const initialDiagnostics = client.getDiagnostics("a-schema.json");
    await client.openDocument("a-schema.json");
    await expect(initialDiagnostics).resolves.toEqual([]);

    const conflictDiagnostics = client.getDiagnostics("a-schema.json");
    const bSchemaUri = await client.writeDocument("b-schema.json", schemaWithId(schemaId, "number"));
    await expect(conflictDiagnostics).resolves.toEqual([
      {
        message: `Duplicate schema identifier. '${bSchemaUri}' also uses the identifier '${schemaId}'`,
        range: {
          start: { line: 2, character: 9 },
          end: { line: 2, character: 11 + schemaId.length }
        },
        severity: DiagnosticSeverity.Warning,
        source: "hyperjump-json-language-server"
      }
    ]);

    const updatedDiagnostics = client.getDiagnostics("a-schema.json");
    await client.deleteDocument("b-schema.json");
    await expect(updatedDiagnostics).resolves.toEqual([]);
  });

  test("deleting the registered schema registers the duplicate in its place", async () => {
    client = new TestClient();
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "string"));
    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    await client.start();

    const initialDiagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialDiagnostics).resolves.toHaveLength(1);

    const conflictDiagnostics = client.getDiagnostics("instance.json");
    await client.writeDocument("b-schema.json", schemaWithId(schemaId, "number"));
    await expect(conflictDiagnostics).resolves.toHaveLength(2);

    const updatedDiagnostics = client.getDiagnostics("instance.json");
    await client.deleteDocument("a-schema.json");
    await expect(updatedDiagnostics).resolves.toEqual([]);

    const bDiagnostics = client.getDiagnostics("b-schema.json");
    await client.openDocument("b-schema.json");
    await expect(bDiagnostics).resolves.toEqual([]);
  });

  test("an identifier that conflicts with a built-in meta-schema is an error and the built-in is still used", async () => {
    const metaSchemaId = "https://json-schema.org/draft/2020-12/schema";

    client = new TestClient();
    await client.writeDocument("conflict.json", `{
      "$schema": "${metaSchemaId}",
      "$id": "${metaSchemaId}"
    }`);
    await client.start();

    const conflictDiagnostics = client.getDiagnostics("conflict.json");
    await client.openDocument("conflict.json");
    await expect(conflictDiagnostics).resolves.toEqual([
      {
        message: `'${metaSchemaId}' is a built-in schema and can't be redefined`,
        range: {
          start: { line: 2, character: 13 },
          end: { line: 2, character: 15 + metaSchemaId.length }
        },
        severity: DiagnosticSeverity.Error,
        source: "hyperjump-json-language-server"
      }
    ]);

    await client.writeDocument("schema.json", `{
      "$schema": "${metaSchemaId}",
      "type": 42
    }`);
    const schemaDiagnostics = client.getDiagnostics("schema.json");
    await client.openDocument("schema.json");
    await expect(schemaDiagnostics).resolves.toEqual([
      expect.objectContaining({ message: expect.stringMatching(/^Expected one of/) as string })
    ]);
  });

  test("a schema that fails to register for a reason other than a duplicate is an error on $id", async () => {
    client = new TestClient();
    await client.start();

    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}"
    }`);
    const initialDiagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialDiagnostics).resolves.toHaveLength(1);

    const updatedDiagnostics = client.getDiagnostics("instance.json");
    await client.writeDocument("bad-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "$defs": {
        "foo": { "$id": "http://[invalid" }
      }
    }`);
    await expect(updatedDiagnostics).resolves.toHaveLength(1);

    const schemaDiagnostics = client.getDiagnostics("bad-schema.json");
    await client.openDocument("bad-schema.json");
    await expect(schemaDiagnostics).resolves.toEqual([
      expect.objectContaining({ severity: DiagnosticSeverity.Error, range: expect.objectContaining({ start: { line: 2, character: 13 } }) as unknown })
    ]);
  });

  test("deleting the duplicate removes the warning", async () => {
    client = new TestClient();
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "string"));
    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    await client.start();

    const initialDiagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialDiagnostics).resolves.toHaveLength(1);

    const conflictDiagnostics = client.getDiagnostics("instance.json");
    await client.writeDocument("b-schema.json", schemaWithId(schemaId, "number"));
    await expect(conflictDiagnostics).resolves.toHaveLength(2);

    const updatedDiagnostics = client.getDiagnostics("instance.json");
    await client.deleteDocument("b-schema.json");
    await expect(updatedDiagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a string" })
    ]);
  });

  test("changing the registered schema without changing its identifier keeps the duplicate as a duplicate", async () => {
    client = new TestClient();
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "string"));
    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    await client.start();

    const initialDiagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialDiagnostics).resolves.toHaveLength(1);

    const conflictDiagnostics = client.getDiagnostics("instance.json");
    await client.writeDocument("b-schema.json", schemaWithId(schemaId, "number"));
    await expect(conflictDiagnostics).resolves.toHaveLength(2);

    const updatedDiagnostics = client.getDiagnostics("instance.json");
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "boolean"));
    await expect(updatedDiagnostics).resolves.toEqual([
      expect.objectContaining({ severity: DiagnosticSeverity.Warning }),
      expect.objectContaining({ message: "Expected a boolean" })
    ]);
  });

  test("a $schema with an empty fragment gets a warning for a duplicate identifier", async () => {
    client = new TestClient();
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "string"));
    await client.writeDocument("b-schema.json", schemaWithId(schemaId, "number"));
    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}#"
    }`);
    await client.start();

    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({ severity: DiagnosticSeverity.Warning })
    ]);
  });

  test("deleting a schema that conflicts with a built-in meta-schema keeps the built-in", async () => {
    const metaSchemaId = "https://json-schema.org/draft/2020-12/schema";

    client = new TestClient();
    await client.writeDocument("conflict.json", `{
      "$schema": "${metaSchemaId}",
      "$id": "${metaSchemaId}"
    }`);
    await client.writeDocument("schema.json", `{
      "$schema": "${metaSchemaId}",
      "type": 42
    }`);
    await client.start();

    const initialDiagnostics = client.getDiagnostics("schema.json");
    await client.openDocument("schema.json");
    await expect(initialDiagnostics).resolves.toEqual([
      expect.objectContaining({ message: expect.stringMatching(/^Expected one of/) as string })
    ]);

    await client.deleteDocument("conflict.json");
    const updatedDiagnostics = client.getDiagnostics("schema.json");
    await client.changeDocument("schema.json", `{
      "$schema": "${metaSchemaId}",
      "type": 43
    }`);
    await expect(updatedDiagnostics).resolves.toEqual([
      expect.objectContaining({ message: expect.stringMatching(/^Expected one of/) as string })
    ]);
  });

  test("a schema that conflicts with a built-in meta-schema doesn't warn documents that use the meta-schema", async () => {
    const metaSchemaId = "https://json-schema.org/draft/2020-12/schema";

    client = new TestClient();
    await client.writeDocument("schema.json", `{
      "$schema": "${metaSchemaId}",
      "type": "string"
    }`);
    await client.writeDocument("conflict.json", `{
      "$schema": "${metaSchemaId}",
      "$id": "${metaSchemaId}",
      "type": "object"
    }`);
    await client.start();

    const initialDiagnostics = client.getDiagnostics("schema.json");
    await client.openDocument("schema.json");
    await expect(initialDiagnostics).resolves.toEqual([]);

    const conflictDiagnostics = client.getDiagnostics("conflict.json");
    await client.openDocument("conflict.json");
    await expect(conflictDiagnostics).resolves.toEqual([
      expect.objectContaining({ message: `'${metaSchemaId}' is a built-in schema and can't be redefined` })
    ]);

    // If the conflicting schema were used, a string schema would be an error
    const updatedDiagnostics = client.getDiagnostics("schema.json");
    await client.changeDocument("schema.json", `{
      "$schema": "${metaSchemaId}",
      "type": "number"
    }`);
    await expect(updatedDiagnostics).resolves.toEqual([]);
  });

  test("changing the identifier of the duplicate removes the error and the warning", async () => {
    client = new TestClient();
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "string"));
    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    await client.start();

    const initialDiagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialDiagnostics).resolves.toHaveLength(1);

    const conflictDiagnostics = client.getDiagnostics("instance.json");
    await client.writeDocument("b-schema.json", schemaWithId(schemaId, "number"));
    await expect(conflictDiagnostics).resolves.toHaveLength(2);

    const bDiagnostics = client.getDiagnostics("b-schema.json");
    await client.openDocument("b-schema.json");
    await expect(bDiagnostics).resolves.toHaveLength(1);

    const updatedBDiagnostics = client.getDiagnostics("b-schema.json");
    await client.writeDocument("b-schema.json", schemaWithId("https://example.com/another-schema", "number"));
    await expect(updatedBDiagnostics).resolves.toEqual([]);

    const updatedInstanceDiagnostics = client.getDiagnostics("instance.json");
    await client.changeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    await expect(updatedInstanceDiagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a string" })
    ]);
  });

  test("changing the identifier of the registered schema registers the duplicate in its place", async () => {
    client = new TestClient();
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "string"));
    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    await client.start();

    const initialDiagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialDiagnostics).resolves.toHaveLength(1);

    const conflictDiagnostics = client.getDiagnostics("instance.json");
    await client.writeDocument("b-schema.json", schemaWithId(schemaId, "number"));
    await expect(conflictDiagnostics).resolves.toHaveLength(2);

    const bDiagnostics = client.getDiagnostics("b-schema.json");
    await client.openDocument("b-schema.json");
    await expect(bDiagnostics).resolves.toHaveLength(1);

    const updatedBDiagnostics = client.getDiagnostics("b-schema.json");
    await client.writeDocument("a-schema.json", schemaWithId("https://example.com/another-schema", "string"));
    await expect(updatedBDiagnostics).resolves.toEqual([]);

    const updatedInstanceDiagnostics = client.getDiagnostics("instance.json");
    await client.changeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    await expect(updatedInstanceDiagnostics).resolves.toEqual([]);
  });

  test("a schema that references a schema with a duplicate identifier is a warning on documents that use it", async () => {
    const parentId = "https://example.com/parent";

    client = new TestClient();
    await client.writeDocument("parent.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${parentId}",
      "$ref": "${schemaId}"
    }`);
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "string"));
    await client.writeDocument("instance.json", `{
      "$schema": "${parentId}",
      "foo": 42
    }`);
    await client.start();

    const initialDiagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(initialDiagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a string" })
    ]);

    const conflictDiagnostics = client.getDiagnostics("instance.json");
    const bSchemaUri = await client.writeDocument("b-schema.json", schemaWithId(schemaId, "number"));
    await expect(conflictDiagnostics).resolves.toEqual([
      {
        message: `Ambiguous schema identifier in referenced schema. '${bSchemaUri}' also uses the identifier '${schemaId}'`,
        range: {
          start: { line: 1, character: 17 },
          end: { line: 1, character: 19 + parentId.length }
        },
        severity: DiagnosticSeverity.Warning,
        source: "hyperjump-json-language-server"
      },
      expect.objectContaining({ message: "Expected a string" })
    ]);

    const updatedDiagnostics = client.getDiagnostics("instance.json");
    await client.deleteDocument("b-schema.json");
    await expect(updatedDiagnostics).resolves.toEqual([
      expect.objectContaining({ message: "Expected a string" })
    ]);
  });

  test("a schema that indirectly references a schema with a duplicate identifier is a warning on documents that use it", async () => {
    const parentId = "https://example.com/parent";
    const middleId = "https://example.com/middle";

    client = new TestClient();
    await client.writeDocument("parent.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${parentId}",
      "$ref": "${middleId}"
    }`);
    await client.writeDocument("middle.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${middleId}",
      "$ref": "${schemaId}"
    }`);
    await client.writeDocument("a-schema.json", schemaWithId(schemaId, "string"));
    const bSchemaUri = await client.writeDocument("b-schema.json", schemaWithId(schemaId, "number"));
    await client.writeDocument("instance.json", `{
      "$schema": "${parentId}"
    }`);
    await client.start();

    const diagnostics = client.getDiagnostics("instance.json");
    await client.openDocument("instance.json");
    await expect(diagnostics).resolves.toEqual([
      expect.objectContaining({
        message: `Ambiguous schema identifier in referenced schema. '${bSchemaUri}' also uses the identifier '${schemaId}'`
      })
    ]);
  });
});
