import * as Pact from "@hyperjump/pact";
import { resolveIri, toAbsoluteIri, toRelativeIri } from "@hyperjump/uri";
import ignore from "ignore";
import * as jsonc from "jsonc-parser";

import type { Server } from "./Server.ts";
import type { Workspace } from "./Workspace.ts";
import type { SchemaObject } from "@hyperjump/json-schema";
import { getKeywordName, hasDialect } from "@hyperjump/json-schema/experimental";
import { registerSchema, unregisterSchema } from "@hyperjump/json-schema";

type SchemaStoreEntry = {
  name: string;
  description: string;
  fileMatch: string[] | undefined;
  url: string;
  versions: Record<string, string>;
};

type CatalogMatcher = {
  url: string;
  matcher: ignore.Ignore;
};

type DidChangeSchemaHandler = (params: DidChangeSchemaParams) => Promise<void> | void;
type DidChangeSchemaParams = {
  schemaUri: string;
};

export class JsonSchemaRegistry {
  private server: Server;
  private workspace: Workspace;
  private catalogMatchers: Promise<CatalogMatcher[]>;
  private schemas: Promise<Set<string>>;
  private workspaceSchemas: Map<string, string> = new Map();
  private pendingRefreshes: Map<string, symbol> = new Map();
  private didChangeSchemaHandlers: Set<DidChangeSchemaHandler> = new Set();

  readonly ready: Promise<void>;

  constructor(server: Server, workspace: Workspace) {
    this.server = server;
    this.workspace = workspace;

    const catalog: Promise<SchemaStoreEntry[]> = new Promise((resolve) => {
      // Not awaited so the workspace scan doesn't wait for the download
      server.onInitialized(() => {
        resolve(this.fetchCatalog());
      });
    });

    this.ready = new Promise((resolve) => {
      server.onInitialized(async () => {
        server.console.log("Scanning workspace for self-identifying schemas...");
        try {
          for (const fileUri of await this.workspace.findFiles("**/*.{json,jsonc}")) {
            await this.refresh(fileUri);
          }
          server.console.log("Scanning completed");
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          server.console.error(`Scanning failed: ${message}`);
        } finally {
          resolve();
        }
      });
    });

    workspace.onDidChangeWatchedFiles(async (params) => {
      await Promise.all(params.changes.map(async (change) => {
        for (const schemaUri of await this.refresh(change.uri)) {
          for (const handler of this.didChangeSchemaHandlers) {
            await handler({ schemaUri });
          }
        }
      }));
    });

    server.onShutdown(() => {
      for (const schemaUri of this.workspaceSchemas.values()) {
        unregisterSchema(schemaUri);
      }
    });

    // Built once so matching a document doesn't rebuild a matcher for every catalog entry
    this.catalogMatchers = catalog.then((catalog) => {
      return Pact.pipe(
        catalog,
        Pact.filter((schemaStoreEntry) => !!schemaStoreEntry.fileMatch),
        Pact.map((schemaStoreEntry) => {
          return {
            url: schemaStoreEntry.url,
            matcher: ignore().add(schemaStoreEntry.fileMatch!)
          };
        }),
        Pact.collectArray
      );
    });

    this.schemas = catalog.then((catalog) => {
      return Pact.pipe(
        catalog,
        Pact.map((entry: { url: string }) => entry.url),
        Pact.collectSet
      );
    });
  }

  onDidChangeSchema(handler: DidChangeSchemaHandler) {
    this.didChangeSchemaHandlers.add(handler);
  }

  async matchSchemaUri(fileUri: string) {
    for (const { url, matcher } of await this.catalogMatchers) {
      for (const workspaceUri of this.workspace.workspaceFolders) {
        if (!fileUri.startsWith(workspaceUri + "/")) {
          continue;
        }

        const relativePath = toRelativeIri(workspaceUri + "/", fileUri);
        if (matcher.ignores(relativePath)) {
          return url;
        }
      }
    }
  }

  async getSchemaUri(fileUri: string) {
    return this.workspaceSchemas.get(fileUri);
  }

  async has(schemaUri: string) {
    return (await this.schemas).has(schemaUri);
  }

  private async fetchCatalog(): Promise<SchemaStoreEntry[]> {
    const startTime = performance.now();
    try {
      const response = await fetch("https://www.schemastore.org/api/json/catalog.json");
      const data = await response.json();
      this.server.console.log(`SchemaStore.org catalog loaded (${(performance.now() - startTime).toFixed(2)}ms)`);
      return data.schemas;
    } catch {
      this.server.console.log(`Failed to load SchemaStore.org catalog (${(performance.now() - startTime).toFixed(2)}ms)`);
      return [];
    }
  }

  private async refresh(fileUri: string): Promise<Set<string>> {
    const token = Symbol();
    this.pendingRefreshes.set(fileUri, token);

    const workspaceSchema = await this.readWorkspaceSchema(fileUri);

    // A newer refresh of this file started while this one was reading it
    if (this.pendingRefreshes.get(fileUri) !== token) {
      return new Set();
    }
    this.pendingRefreshes.delete(fileUri);

    // No awaits from here on so no other refresh can interleave
    const oldSchemaUri = this.workspaceSchemas.get(fileUri);
    if (oldSchemaUri) {
      unregisterSchema(oldSchemaUri);
      this.workspaceSchemas.delete(fileUri);
    }

    if (workspaceSchema?.schema) {
      try {
        registerSchema(workspaceSchema.schema);
        this.workspaceSchemas.set(fileUri, workspaceSchema.id);
        this.server.console.log(`Registered local schema: ${workspaceSchema.id} (from ${fileUri})`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.server.console.error(`Failed to process local schema at ${fileUri}: ${message}`);
      }
    } else if (workspaceSchema) {
      this.workspaceSchemas.set(fileUri, workspaceSchema.id);
    }

    const newSchemaUri = this.workspaceSchemas.get(fileUri);

    // Not a schema before or after this change
    return new Set([oldSchemaUri, newSchemaUri].filter((uri) => uri !== undefined));
  }

  private async readWorkspaceSchema(fileUri: string): Promise<{ id: string; schema?: SchemaObject } | undefined> {
    try {
      const text = await this.workspace.readFile(fileUri);
      const schema = jsonc.parse(text);

      if (typeof schema?.["$schema"] === "string") {
        const dialectId = toAbsoluteIri(resolveIri(schema.$schema, fileUri));

        if (hasDialect(dialectId)) {
          const idKeyword = getKeywordName(dialectId, "https://json-schema.org/keyword/id")
            || getKeywordName(dialectId, "https://json-schema.org/keyword/draft-04/id");

          if (idKeyword && typeof schema[idKeyword] === "string") {
            return { id: toAbsoluteIri(schema[idKeyword]), schema };
          } else {
            return { id: fileUri };
          }
        }
      }
    } catch {
      // Not a schema
    }
  }
}
