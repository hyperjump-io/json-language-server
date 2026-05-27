import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { TextDocumentSyncKind } from "vscode-languageserver";
import { TestClient } from "./test/test-client.ts";

describe("JSON Language Server", () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient();
    await client.start();
  });

  afterAll(async () => {
    await client.stop();
  });

  test("textDocumentSync = Incremental", () => {
    expect(client.serverCapabilities?.textDocumentSync).to.equal(TextDocumentSyncKind.Incremental);
  });

  test("invalid JSON syntax returns a diagnostic", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("test.json", `{ "name": }`);
    await client.openDocument("test.json");

    const diagnostics = await diagnosticsPromise;
    expect(diagnostics).toHaveLength(1);
  });

  test("valid JSON Syntax should not return a diagnostic", async () => {
    const diagnosticsPromise = new Promise((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("test.json", `{ "Name": "Foo" }`);
    await client.openDocument("test.json");

    const diagnostics = await diagnosticsPromise;
    expect(diagnostics).toHaveLength(0);
  });
});
