import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../test/TestClient.ts";

import type { Diagnostic, PublishDiagnosticsParams } from "vscode-languageserver";

describe("Schema Store Tests", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();

    client.mockAgent
      .get("https://www.schemastore.org")
      .intercept({ method: "GET", path: "/api/json/catalog.json" })
      .reply(200, {
        $schema: "https://www.schemastore.org/schema-catalog.json",
        version: 0,
        schemas: [
          {
            name: "fixture.json",
            description: "Example configuration",
            fileMatch: ["fixture.json", "**/anywhere.json", "**/foo/*"],
            url: "https://www.schemastore.org/fixture.json"
          }
        ]
      });

    client.mockAgent
      .get("https://www.schemastore.org")
      .intercept({ method: "GET", path: "/fixture.json" })
      .reply(200, {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          foo: { type: "string" }
        }
      }, {
        headers: {
          "Content-Type": "application/json"
        }
      });
  });

  afterEach(async () => {
    await client.stop();
  });

  test("schemastore.org match at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("fixture.json", `{ "foo": 42 }`);
    await client.openDocument("fixture.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("schemastore.org doesn't match file not at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("sub-folder/fixture.json", `{ "foo": 42 }`);
    await client.openDocument("sub-folder/fixture.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });

  test("schemastore.org match file anywhere in workspace", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("sub-folder/anywhere.json", `{ "foo": 42 }`);
    await client.openDocument("sub-folder/anywhere.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("schemastore.org match complex pattern in workspace", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("sub-folder/foo/anything.json", `{ "foo": 42 }`);
    await client.openDocument("sub-folder/foo/anything.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("schemastore.org match and $schema", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      properties: {
        foo: { type: "number" }
      }
    }`);

    await client.writeDocument("fixture.json", `{
      "$schema": "schema.json",
      "foo": 42
    }`);
    await client.openDocument("fixture.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });
});
