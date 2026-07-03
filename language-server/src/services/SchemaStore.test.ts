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
            fileMatch: [
              "anywhere.json",
              "**/explicit-anywhere.json",
              "/root-only.json",
              "sub-folder/schema.json",
              "wildcard/*.json",
              "double-wildcard/**",
              "complex/**/foo/*/schema.json"
            ],
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

  // Anywhere pattern

  test("schemastore.org anywhere pattern at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("anywhere.json", `{ "foo": 42 }`);
    await client.openDocument("anywhere.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("schemastore.org anywhere pattern not at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("sub-folder/anywhere.json", `{ "foo": 42 }`);
    await client.openDocument("sub-folder/anywhere.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  // Explict-anywhere pattern

  test("schemastore.org explict-anywhere pattern at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("explicit-anywhere.json", `{ "foo": 42 }`);
    await client.openDocument("explicit-anywhere.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("schemastore.org explict-anywhere pattern not at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("sub-folder/explicit-anywhere.json", `{ "foo": 42 }`);
    await client.openDocument("sub-folder/explicit-anywhere.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  // Root-only pattern

  test("schemastore.org root-only pattern at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("root-only.json", `{ "foo": 42 }`);
    await client.openDocument("root-only.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("schemastore.org root-only pattern not at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("sub-folder/root-only.json", `{ "foo": 42 }`);
    await client.openDocument("sub-folder/root-only.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });

  // Sub-folder pattern

  test("schemastore.org sub-folder pattern at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("sub-folder/schema.json", `{ "foo": 42 }`);
    await client.openDocument("sub-folder/schema.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("schemastore.org sub-folder pattern not at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("path/to/sub-folder/schema.json", `{ "foo": 42 }`);
    await client.openDocument("path/to/sub-folder/schema.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });

  // Wildcard pattern

  test("schemastore.org wildcard pattern at workspace root", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("wildcard/schema.json", `{ "foo": 42 }`);
    await client.openDocument("wildcard/schema.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("schemastore.org wildcard pattern deep folders", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("wildcard/deep/schema.json", `{ "foo": 42 }`);
    await client.openDocument("wildcard/deep/schema.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });

  // Double-wildcard pattern

  test("schemastore.org double-wildcard pattern deep folders", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("double-wildcard/deep/schema.json", `{ "foo": 42 }`);
    await client.openDocument("double-wildcard/deep/schema.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  // Complex pattern

  test("schemastore.org complex pattern", async () => {
    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("complex/path/to/foo/v1/schema.json", `{ "foo": 42 }`);
    await client.openDocument("complex/path/to/foo/v1/schema.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  // $schema conflict

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
