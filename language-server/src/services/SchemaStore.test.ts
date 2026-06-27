import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../test/TestClient.ts";

import type { Diagnostic, PublishDiagnosticsParams } from "vscode-languageserver";

describe("Schema Store Tests", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("file with NO $schema field gets validated correctly against the SchemaStore.org matched schema", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    // license should be a string.
    await client.writeDocument("package.json", `{
      "name": "@hyperjump/json-language-server",
      "version": "0.1.0",
      "description": "JSON Language Server",
      "type": "module",
      "license": false, 
      "repository": "github:hyperjump-io/json-language-server",
      "keywords": []
    }`);

    await client.openDocument("package.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  }, 15000);

  test("for a filename with NO catalog match, we skip validation", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("abcdrandom.json", `{
      "name": "SchemaStore.org",
      "version": "0.1.0",
      "description": "Just a test."
    }`);

    await client.openDocument("abcdrandom.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });
});
