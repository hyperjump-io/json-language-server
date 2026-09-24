import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { TestClient } from "../../test/TestClient.ts";

describe("Syntax Validation", () => {
  let client: TestClient;

  beforeEach(async () => {
    client = new TestClient();
    await client.start();
  });

  afterEach(async () => {
    await client.stop();
  });

  test("invalid JSON syntax returns a diagnostic", async () => {
    await client.writeDocument("test.json", `{ "name": }`);
    const diagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(diagnostics).resolves.toHaveLength(1);
  });

  test("valid JSON Syntax should not return a diagnostic", async () => {
    await client.writeDocument("test.json", `{ "Name": "Foo" }`);
    const diagnostics = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(diagnostics).resolves.toHaveLength(0);
  });

  test("after fixing invalid JSON Syntax, it should not return a diagnostic", async () => {
    await client.writeDocument("test.json", `{ "name": }`);
    const initialValidation = client.getDiagnostics("test.json");
    await client.openDocument("test.json");

    await expect(initialValidation).resolves.toHaveLength(1);

    const secondValidation = client.getDiagnostics("test.json");
    await client.changeDocument("test.json", `{ "Name": "Foo" }`);

    await expect(secondValidation).resolves.toHaveLength(0);
  });
});
