import { describe, test, expect } from "vitest";
import { SchemaStore } from "./SchemaStore.ts";

import type { Server } from "./server.ts";

const mockServer = {
  onDidChangeWatchedFiles: () => { }
} as unknown as Server;

const schemaStore = new SchemaStore(mockServer);

describe("Schema Store Tests", () => {
  test("Match found for a filename", async () => {
    let fileNames = ["package.json",
      "tsconfig.json",
      "hol-skill.json",
      "abc-inventory-module-data-abs.json"];

    for (let fileName of fileNames) {
      const schemaURL = await schemaStore.getSchemaUri(fileName);
      expect(schemaURL).not.toBeUndefined();
    }
  });

  test("Match NOT found for a filename", async () => {
    let fileName = "abcdrandom.json";
    const schemaURL = await schemaStore.getSchemaUri(fileName);

    expect(schemaURL).toBeUndefined();
  });
});
