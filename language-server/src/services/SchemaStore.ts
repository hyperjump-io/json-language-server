import { compile, getSchema, getKeywordName, buildSchemaDocument } from "@hyperjump/json-schema/experimental";
import { registerSchema, unregisterSchema } from "@hyperjump/json-schema";
import { evaluateCompiledSchema } from "@hyperjump/json-schema-errors";
import { addMediaTypePlugin, addUriSchemePlugin, getFileMediaType, httpSchemePlugin } from "@hyperjump/browser";
import { normalizeIri, parseIri, resolveIri, toAbsoluteIri, toRelativeIri } from "@hyperjump/uri";
import * as jsonc from "jsonc-parser";
import * as Pact from "@hyperjump/pact";
import ignore from "ignore";
import { FileChangeType } from "vscode-languageserver";
import { abbreviateUri } from "../util/utils.ts";

import type { CompiledSchema, EvaluationPlugin } from "@hyperjump/json-schema/experimental";
import type { Json } from "@hyperjump/json-schema-errors";
import type { SchemaObject } from "@hyperjump/json-schema";
import type { UriSchemePlugin } from "@hyperjump/browser";
import type { Server } from "../services/Server.ts";
import type { Workspace } from "./Workspace.ts";

type SchemaStoreEntry = {
  name: string;
  description: string;
  fileMatch: string[];
  url: string;
  versions: Record<string, string>;
};

export class SchemaStore {
  private server: Server;
  private workspace: Workspace;
  private compiledSchemaCache: Map<string, Promise<CompiledSchema>> = new Map();
  private catalog: Promise<SchemaStoreEntry[]>;
  private workspaceSchemaIds: Map<string, string> = new Map();
  private workspaceSchemaFiles: Map<string, string> = new Map();
  private scanCompleted: Promise<void>;

  constructor(server: Server, workspace: Workspace) {
    this.server = server;
    this.workspace = workspace;
    this.catalog = new Promise((resolve) => {
      server.onInitialized(async () => {
        const startTime = performance.now();
        try {
          const response = await fetch("https://www.schemastore.org/api/json/catalog.json");
          const data = await response.json();
          server.console.log(`SchemaStore.org catalog loaded (${(performance.now() - startTime).toFixed(2)}ms)`);
          resolve(data.schemas);
        } catch {
          server.console.log(`Failed to load SchemaStore.org catalog (${(performance.now() - startTime).toFixed(2)}ms)`);
          resolve([]);
        }
      });
    });

    this.scanCompleted = new Promise<void>((resolve) => {
      server.onInitialized(async () => {
        this.server.console.log("Scanning workspace for self-identifying schemas...");
        for (const fileUri of await this.workspace.findFiles("**/*.{json,jsonc}")) {
          await this.processWorkspaceSchemaFile(fileUri);
        }
        this.server.console.log("Scanning completed");
        resolve();
      });
    }).catch(() => {});

    const schemaAllowList = this.catalog.then((catalog) => {
      return Pact.pipe(
        catalog,
        Pact.map((entry: { url: string }) => entry.url),
        Pact.collectSet
      );
    });

    addMediaTypePlugin("application/json", {
      parse: async (response) => {
        return buildSchemaDocument(await response.json(), response.url);
      },
      fileMatcher: async (path) => path.endsWith(".json")
    });

    const uriSchemePlugin: UriSchemePlugin = {
      async retrieve(uri: string) {
        if (!(await schemaAllowList).has(uri) && !uri.startsWith("https://json.schemastore.org")) {
          throw Error(`Only schemas in the SchemaStore.org registry can be retrieved over HTTP.`);
        }

        return httpSchemePlugin.retrieve(uri);
      }
    };
    addUriSchemePlugin("http", uriSchemePlugin);
    addUriSchemePlugin("https", uriSchemePlugin);

    addUriSchemePlugin("file", {
      async retrieve(uri, baseUri) {
        if (baseUri) {
          const { scheme } = parseIri(baseUri);

          if (scheme !== "file") {
            throw Error(`Accessing a file (${uri}) from a non-filesystem context (${baseUri}) is not allowed`);
          }
        }

        let responseUri = toAbsoluteIri(uri);

        const contentType = await getFileMediaType(responseUri);
        const file = await workspace.readFile(uri);
        const stream = new Blob([file]).stream();
        const response = new Response(stream, {
          headers: { "Content-Type": contentType }
        });
        Object.defineProperty(response, "url", { value: responseUri });

        return response;
      }
    });

    workspace.onDidChangeWatchedFiles(async (params) => {
      this.scanCompleted = this.scanCompleted
        .then(async () => {
          for (const change of params.changes) {
            const changedFileUri = normalizeIri(change.uri);
            await this.clear(changedFileUri);
            this.unregisterWorkspaceSchema(changedFileUri);
            if (change.type !== FileChangeType.Deleted) {
              await this.processWorkspaceSchemaFile(changedFileUri);
            }
          }
        })
        .catch(() => { });

      await this.scanCompleted;
    });

    server.onShutdown(() => {
      for (const fileUri of this.workspaceSchemaIds.keys()) {
        this.unregisterWorkspaceSchema(fileUri);
      }
    });
  }

  async getSchemaUri(fileUri: string) {
    for (const { fileMatch, url } of await this.catalog) {
      if (!fileMatch) {
        continue;
      }

      const ig = ignore().add(fileMatch);
      for (const workspaceUri of this.workspace.workspaceFolders) {
        if (!fileUri.startsWith(workspaceUri + "/")) {
          continue;
        }

        const relativePath = toRelativeIri(workspaceUri + "/", fileUri);
        if (ig.ignores(relativePath)) {
          return url;
        }
      }
    }
  }

  async validate(schemaUri: string, instance: Json, instanceUri: string, plugins: EvaluationPlugin[] = []) {
    await this.scanCompleted;

    if (!this.compiledSchemaCache.has(schemaUri)) {
      this.compiledSchemaCache.set(schemaUri, (async function (server) {
        const startTime = performance.now();
        const schema = await getSchema(schemaUri);
        const compiledSchema = await compile(schema);
        server.console.log(`compile schema for ${abbreviateUri(schemaUri)} (${(performance.now() - startTime).toFixed(2)}ms)`);
        return compiledSchema;
      }(this.server)));
    }

    const compiledSchema = await this.compiledSchemaCache.get(schemaUri)!;
    const startTime = performance.now();
    const result = evaluateCompiledSchema(compiledSchema, instance, { plugins });
    this.server.console.log(`validate ${abbreviateUri(instanceUri)} against schema ${abbreviateUri(schemaUri)} (${(performance.now() - startTime).toFixed(2)}ms)`);
    return result;
  }

  async getDependentSchemaUris(schemaUri: string) {
    const compiledSchemaPromise = this.compiledSchemaCache.get(schemaUri);
    if (compiledSchemaPromise === undefined) {
      return;
    }
    const compiledSchema = await compiledSchemaPromise;
    return this.getDependenencies(compiledSchema);
  }

  async clear(fileUri: string) {
    const changedSchemaUri = this.workspaceSchemaIds.get(fileUri) ?? fileUri;

    for (const [cachedSchemaUri, compiledSchema] of this.compiledSchemaCache) {
      try {
        const dependentSchemas = this.getDependenencies(await compiledSchema);
        if (!dependentSchemas.has(changedSchemaUri)) {
          continue;
        }
      } catch {
      }

      this.server.console.log(`clear schema cache for ${abbreviateUri(cachedSchemaUri)}`);
      this.compiledSchemaCache.delete(cachedSchemaUri);

      // A workspace schema that depends on the changed file is re-registered
      // rather than dropped because nothing else would register it again.
      const cachedFileUri = this.workspaceSchemaFiles.get(cachedSchemaUri);
      if (cachedFileUri && cachedFileUri !== fileUri) {
        this.unregisterWorkspaceSchema(cachedFileUri);
        await this.processWorkspaceSchemaFile(cachedFileUri);
      } else {
        unregisterSchema(cachedSchemaUri);
      }
    }
  }

  private registerWorkspaceSchema(fileUri: string, id: string, schema: SchemaObject) {
    registerSchema(schema);
    this.workspaceSchemaIds.set(fileUri, id);
    this.workspaceSchemaFiles.set(id, fileUri);
  }

  private unregisterWorkspaceSchema(fileUri: string) {
    const id = this.workspaceSchemaIds.get(fileUri);
    if (id === undefined) {
      return;
    }

    unregisterSchema(id);
    this.workspaceSchemaIds.delete(fileUri);
    this.workspaceSchemaFiles.delete(id);
  }

  private getDependenencies(compiledSchema: CompiledSchema) {
    const dependentSchemas = new Set<string>();
    for (const key of Object.keys(compiledSchema.ast)) {
      if (key !== "metaData" && key !== "plugins") {
        dependentSchemas.add(key.split("#")[0]);
      }
    }
    return dependentSchemas;
  }

  private async processWorkspaceSchemaFile(fileUri: string) {
    try {
      const text = await this.workspace.readFile(fileUri);
      const schema = jsonc.parse(text);

      if (typeof schema?.["$schema"] === "string") {
        const dialectId = toAbsoluteIri(resolveIri(schema.$schema, fileUri));
        const idKeyword = getKeywordName(dialectId, "https://json-schema.org/keyword/id")
          || getKeywordName(dialectId, "https://json-schema.org/keyword/draft-04/id");

        if (idKeyword) {
          if (typeof schema[idKeyword] === "string") {
            try {
              const id = toAbsoluteIri(schema[idKeyword]);
              this.registerWorkspaceSchema(fileUri, id, schema);

              this.server.console.log(`Registered local schema: ${id} (from ${fileUri})`);
            } catch (error: unknown) {
              const message = error instanceof Error ? error.message : String(error);
              this.server.console.error(`Failed to process local schema at ${fileUri}: ${message}`);
            }
          }
        }
      }
    } catch {
      // Not a schema
    }
  }
}
