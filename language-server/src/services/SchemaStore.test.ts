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

  test("a JSON document without $schema finds a schema in the schemastore.org catalog", async () => {
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
            fileMatch: ["fixture.json"],
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

    const diagnostics = new Promise<Diagnostic[]>((resolve) => {
      client.onNotification("textDocument/publishDiagnostics", (params: PublishDiagnosticsParams) => {
        resolve(params.diagnostics);
      });
    });

    await client.writeDocument("fixture.json", `{ "foo": 42 }`);
    await client.openDocument("fixture.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });
});
