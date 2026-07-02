import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../test/TestClient.ts";
import { unregisterSchema } from "@hyperjump/json-schema";

import type { Diagnostic, PublishDiagnosticsParams } from "vscode-languageserver";

describe("Self-Identifying Schemas", () => {
  let client: TestClient;
  const schemaId = "https://example.com/my-workspace-schema";

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
    try {
      unregisterSchema(schemaId);
    } catch {
      // Ignore if not registered
    }
  });

  test("should register self-identifying schema and validate document using its $id", async () => {
    // 1. Create a self-identifying schema file in the workspace
    await client.writeDocument("my-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "foo": { "type": "string" }
      }
    }`);

    // Wait a brief moment for the watched file event to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 2. Create and open an instance file that references the local schema by its $id
    const diagnosticsPromise = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        if (params.uri.endsWith("instance.json")) {
          resolve(params.diagnostics);
        }
      });
    });

    await client.writeDocument("instance.json", `{
      "$schema": "${schemaId}",
      "foo": 42
    }`);
    await client.openDocument("instance.json");

    const diagnostics = await diagnosticsPromise;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Expected a ⁨string⁩");

    // Clear socket queue from duplicate open/watch notifications
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 3. Update the schema to allow a number for "foo"
    const updatedDiagnosticsPromise = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        if (params.uri.endsWith("instance.json")) {
          resolve(params.diagnostics);
        }
      });
    });

    await client.writeDocument("my-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "foo": { "type": "number" }
      }
    }`);

    // Wait a brief moment for the watched file event and write to settle on Windows
    await new Promise((resolve) => setTimeout(resolve, 100));

    const updatedDiagnostics = await updatedDiagnosticsPromise;
    expect(updatedDiagnostics).toHaveLength(0);
  });

  test("should discover and register self-identifying schemas on startup", async () => {
    // Create a new client specifically for this test so we can write the document before starting the server
    const startupClient = new TestClient();

    await startupClient.writeDocument("startup-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "bar": { "type": "number" }
      }
    }`);

    // Start server, which triggers the startup scan
    await startupClient.start();

    // Wait a brief moment for the startup scan to finish
    await new Promise((resolve) => setTimeout(resolve, 200));

    const diagnosticsPromise = new Promise<Diagnostic[]>((resolve) => {
      startupClient.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        if (params.uri.endsWith("instance2.json")) {
          resolve(params.diagnostics);
        }
      });
    });

    await startupClient.writeDocument("instance2.json", `{
      "$schema": "${schemaId}",
      "bar": "not a number"
    }`);
    await startupClient.openDocument("instance2.json");

    const diagnostics = await diagnosticsPromise;
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain("Expected a ⁨number⁩");

    await startupClient.stop();
  });

  test("should unregister schema when schema file is deleted", async () => {
    // 1. Create schema
    await client.writeDocument("delete-schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "${schemaId}",
      "type": "object",
      "properties": {
        "baz": { "type": "boolean" }
      }
    }`);

    await new Promise((resolve) => setTimeout(resolve, 100));

    // 2. Delete the schema file
    await client.deleteDocument("delete-schema.json");

    // Wait for the deletion watched file event to process
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 3. Try to validate an instance against the deleted schema (should fail to load schema)
    const diagnosticsPromise = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        if (params.uri.endsWith("instance3.json")) {
          resolve(params.diagnostics);
        }
      });
    });

    await client.writeDocument("instance3.json", `{
      "$schema": "${schemaId}",
      "baz": "true"
    }`);
    await client.openDocument("instance3.json");

    const diagnostics = await diagnosticsPromise;
    // Since the schema was unregistered and doesn't exist on the web (fake URL), validation diagnostics won't succeed/will be empty
    expect(diagnostics).toHaveLength(0);
  });
});
