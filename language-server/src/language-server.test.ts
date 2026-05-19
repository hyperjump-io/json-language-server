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
});
