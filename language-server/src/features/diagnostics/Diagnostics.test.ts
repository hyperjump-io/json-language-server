import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { TestClient } from "../../test/TestClient.ts";
import { ReadFileRequest } from "../../protocol/hyperjump-readFile.ts";

import type { Diagnostic } from "vscode-languageserver";

describe("Diagnostics", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("closing a document with errors publishes an empty list", async () => {
    await client.writeDocument("test.json", `{ "name": }`);
    const initialDiagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(initialDiagnostics).resolves.toHaveLength(1);

    const closeDiagnostics = client.getDiagnostics("test.json");
    await client.closeDocument("test.json");

    await expect(closeDiagnostics).resolves.toEqual([]);
  });

  test("closing while a validation is in flight does not publish stale results afterwards", async () => {
    const schemaUri = await client.writeDocument("schema.json", `{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "properties": {
        "name": { "type": "string" }
      }
    }`);
    await client.writeDocument("test.json", `{ "$schema": "${schemaUri}", "name": 42 }`);

    // Hold the schema read so the validation is guaranteed to still be in flight when the document closes
    const { promise: schemaRequested, resolve: requestSchema } = Promise.withResolvers<void>();
    const { promise: schemaReleased, resolve: releaseSchema } = Promise.withResolvers<void>();
    client.onRequest(ReadFileRequest.type, async ({ uri }) => {
      if (uri === schemaUri) {
        requestSchema();
        await schemaReleased;
      }
      return await readFile(fileURLToPath(uri), "utf8");
    });

    const receivedDiagnostics: Diagnostic[][] = [];
    await client.onDiagnostics("test.json", (diagnostics) => {
      receivedDiagnostics.push(diagnostics);
    });

    await client.openDocument("test.json");
    await schemaRequested;
    await client.closeDocument("test.json");
    releaseSchema();

    // Reopening publishes once the reopened document is validated. The stale validation was released first, so
    // anything it published would arrive before this.
    await client.writeDocument("test.json", `{ "$schema": "${schemaUri}", "name": "foo" }`);
    const reopenDiagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");
    await expect(reopenDiagnostics).resolves.toEqual([]);

    expect(receivedDiagnostics).toEqual([[], []]);
  });

  test("closing a document with no diagnostics does not throw", async () => {
    await client.writeDocument("test.json", `{ "name": "foo" }`);
    const initialDiagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(initialDiagnostics).resolves.toEqual([]);

    const closeDiagnostics = client.getDiagnostics("test.json");
    await expect(client.closeDocument("test.json")).resolves.not.toThrow();

    await expect(closeDiagnostics).resolves.toEqual([]);
  });

  test("closing and then reopening a document works normally and publishes fresh diagnostics", async () => {
    await client.writeDocument("test.json", `{ "name": }`);
    const initialDiagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(initialDiagnostics).resolves.toHaveLength(1);

    const closeDiagnostics = client.getDiagnostics("test.json");
    await client.closeDocument("test.json");

    await expect(closeDiagnostics).resolves.toEqual([]);

    const reopenDiagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(reopenDiagnostics).resolves.toHaveLength(1);
  });
});
