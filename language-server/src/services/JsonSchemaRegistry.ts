import * as Pact from "@hyperjump/pact";
import { normalizeIri, resolveIri, toAbsoluteIri, toRelativeIri } from "@hyperjump/uri";
import ignore from "ignore";
import * as jsonc from "jsonc-parser";

import type { Server } from "./Server.ts";
import type { Workspace } from "./Workspace.ts";
import type { SchemaObject } from "@hyperjump/json-schema";
import { getKeywordName, hasDialect } from "@hyperjump/json-schema/experimental";
import { hasSchema, registerSchema, unregisterSchema } from "@hyperjump/json-schema";

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
  fileUri: string;
};

const readChunkSize = 100;

export class JsonSchemaRegistry {
  private server: Server;
  private workspace: Workspace;
  private catalogMatchers: Promise<CatalogMatcher[]>;
  private schemas: Promise<Set<string>>;
  private workspaceSchemas: Map<string, string> = new Map();
  private failedSchemas: Map<string, { id: string; message: string }> = new Map();
  private didChangeSchemaHandlers: Set<DidChangeSchemaHandler> = new Set();
  private pending: Promise<void>;

  constructor(server: Server, workspace: Workspace) {
    this.server = server;
    this.workspace = workspace;

    const catalog: Promise<SchemaStoreEntry[]> = new Promise((resolve) => {
      // Not awaited so the workspace scan doesn't wait for the download
      server.onInitialized(() => {
        resolve(this.fetchCatalog());
      });
    });

    this.pending = new Promise((resolve) => {
      server.onInitialized(async () => {
        server.console.log("Scanning workspace for self-identifying schemas...");
        try {
          await this.applyChanges(await this.workspace.findFiles("**/*.{json,jsonc}"));
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
      // Changes are applied in the order they're received. Otherwise, which of two schemas with the
      // same id gets registered would depend on which file read finishes first.
      const applied = this.pending.then(() => this.applyChanges(params.changes.map((change) => normalizeIri(change.uri))));
      this.pending = applied.then(() => undefined, () => undefined);

      // Handlers aren't part of the queue because they can wait on `ready`
      for (const [fileUri, schemaUris] of await applied) {
        for (const schemaUri of schemaUris) {
          for (const handler of this.didChangeSchemaHandlers) {
            await handler({ schemaUri, fileUri });
          }
        }
      }
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

  // Resolves when the workspace scan and all file changes received so far have been applied
  get ready() {
    return this.pending;
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

  // The file of the registered workspace schema that uses the id
  getFileUri(schemaUri: string) {
    // Registered ids never have a fragment, but $schema can, e.g. "https://example.com/schema#"
    schemaUri = toAbsoluteIri(schemaUri);
    for (const [fileUri, workspaceSchemaUri] of this.workspaceSchemas) {
      if (workspaceSchemaUri === schemaUri && hasSchema(schemaUri)) {
        return fileUri;
      }
    }
  }

  getRegistrationError(fileUri: string) {
    return this.failedSchemas.get(fileUri)?.message;
  }

  // Files with schemas that failed to register because another schema already uses the id
  getDuplicates(schemaUri: string) {
    // Registered ids never have a fragment, but $schema can, e.g. "https://example.com/schema#"
    schemaUri = toAbsoluteIri(schemaUri);
    return Pact.pipe(
      this.failedSchemas,
      Pact.filter(([, { id }]) => id === schemaUri && this.isWorkspaceSchema(id)),
      Pact.map(([fileUri]) => fileUri),
      Pact.collectArray
    );
  }

  private isWorkspaceSchema(schemaUri: string) {
    return Pact.some((workspaceSchemaUri) => {
      return workspaceSchemaUri === schemaUri && hasSchema(schemaUri);
    }, this.workspaceSchemas.values());
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

  private async applyChanges(fileUris: string[]) {
    const refreshed: [string, Set<string>][] = [];

    // Reading is the slow part, so files are read in parallel and then applied in order. Chunked so
    // a large workspace scan doesn't hold every file in memory at once.
    for (let start = 0; start < fileUris.length; start += readChunkSize) {
      const chunk = fileUris.slice(start, start + readChunkSize);
      const contents = await Promise.all(chunk.map((fileUri) => this.readJson(fileUri)));

      for (const [index, changedFileUri] of chunk.entries()) {
        const schemaUris = this.refresh(changedFileUri, contents[index]);
        refreshed.push([changedFileUri, schemaUris]);

        // A schema that failed to register because of a duplicate id might succeed now.
        // Iterate a copy because a retry that fails again is re-added to the map.
        for (const [fileUri, { id }] of [...this.failedSchemas]) {
          if (schemaUris.has(id) && !hasSchema(id)) {
            refreshed.push([fileUri, this.refresh(fileUri, await this.readJson(fileUri))]);
          }
        }
      }
    }

    return refreshed;
  }

  // Only call from the queue in `pending` so changes are applied in order
  private refresh(fileUri: string, json: unknown): Set<string> {
    // Interpreted here rather than when read because a dialect can come from a schema registered
    // by an earlier change
    const workspaceSchema = this.toWorkspaceSchema(fileUri, json);

    const oldSchemaUri = this.workspaceSchemas.get(fileUri);
    const oldFailedSchemaUri = this.failedSchemas.get(fileUri)?.id;
    this.failedSchemas.delete(fileUri);
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
        const message = hasSchema(workspaceSchema.id) && !this.isWorkspaceSchema(workspaceSchema.id)
          ? `'${workspaceSchema.id}' is a built-in schema and can't be redefined`
          : error instanceof Error ? error.message : String(error);
        this.failedSchemas.set(fileUri, { id: workspaceSchema.id, message });
        this.server.console.error(`Failed to process local schema at ${fileUri}: ${message}`);
      }
    } else if (workspaceSchema) {
      this.workspaceSchemas.set(fileUri, workspaceSchema.id);
    }

    const newSchemaUri = this.workspaceSchemas.get(fileUri);
    const newFailedSchemaUri = this.failedSchemas.get(fileUri)?.id;

    // Not a schema before or after this change
    return new Set([oldSchemaUri, oldFailedSchemaUri, newSchemaUri, newFailedSchemaUri].filter((uri) => uri !== undefined));
  }

  private async readJson(fileUri: string): Promise<unknown> {
    try {
      return jsonc.parse(await this.workspace.readFile(fileUri)) as unknown;
    } catch {
      // Deleted or unreadable
    }
  }

  private toWorkspaceSchema(fileUri: string, json: unknown): { id: string; schema?: SchemaObject } | undefined {
    try {
      const schema = json as SchemaObject | undefined;

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
