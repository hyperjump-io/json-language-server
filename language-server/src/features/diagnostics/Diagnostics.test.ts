import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { PublishDiagnosticsNotification } from "vscode-languageserver";
import { TestClient } from "../../test/TestClient.ts";

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
    await client.writeDocument("test.json", `{ "name": }`);

    const receivedDiagnostics: Diagnostic[][] = [];
    client.onNotification(PublishDiagnosticsNotification.type, (params) => {
      if (params.uri.endsWith("test.json")) {
        receivedDiagnostics.push(params.diagnostics);
      }
    });

    await client.openDocument("test.json");
    await client.closeDocument("test.json");

    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(receivedDiagnostics.length).toBeGreaterThan(0);
    expect(receivedDiagnostics.at(-1)).toEqual([]);
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
