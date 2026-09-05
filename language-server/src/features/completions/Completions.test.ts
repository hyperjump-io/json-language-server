import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../../test/TestClient.ts";

describe("Completions", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("should register the completion provider capability", async () => {
    expect(client.serverCapabilities!.completionProvider).toEqual({
      triggerCharacters: [":", "\""]
    });
  });
});
