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
import type { ValidationResult } from "@hyperjump/json-schema-errors";
import type { SchemaObject } from "@hyperjump/json-schema";
import type { UriSchemePlugin } from "@hyperjump/browser";
import type { Server } from "../services/Server.ts";
import type { Workspace } from "./Workspace.ts";
import type { JsonDocument } from "../models/JsonDocument.ts";

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

type EvaluationPluginFactory = (jsonDocument: JsonDocument) => EvaluationPlugin;

type SchemaEvaluation = {
  version: number;
  schemaUri: string | undefined;
  compiledSchema: CompiledSchema | undefined;
  plugins: Map<string, EvaluationPlugin>;
  result: ValidationResult | undefined;
};

export class SchemaStore {
  private server: Server;
  private workspace: Workspace;
  private compiledSchemaCache: Map<string, Promise<CompiledSchema>> = new Map();
  private evaluationCache: WeakMap<JsonDocument, SchemaEvaluation> = new WeakMap();
  private pluginFactories: Map<string, EvaluationPluginFactory> = new Map();
  private catalogMatchers: Promise<CatalogMatcher[]>;
  private workspaceSchemaIds: Map<string, string> = new Map();
  private workspaceSchemaFiles: Map<string, string> = new Map();
  private scanCompleted: Promise<void>;
  private didChangeSchemaHandlers: Set<() => Promise<void> | void> = new Set();

  constructor(server: Server, workspace: Workspace) {
    this.server = server;
    this.workspace = workspace;

    const catalog: Promise<SchemaStoreEntry[]> = new Promise((resolve) => {
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

    const schemaAllowList = catalog.then((catalog) => {
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

      // Notified after the chain completes because handlers may validate, and validation waits for the chain
      for (const handler of this.didChangeSchemaHandlers) {
        await handler();
      }
    });

    server.onShutdown(() => {
      for (const fileUri of this.workspaceSchemaIds.keys()) {
        this.unregisterWorkspaceSchema(fileUri);
      }
    });
  }

  onDidChangeSchema(handler: () => Promise<void> | void) {
    this.didChangeSchemaHandlers.add(handler);
  }

  registerPlugin(id: string, factory: EvaluationPluginFactory) {
    this.pluginFactories.set(id, factory);
  }

  async getEvaluationPlugin<PluginType extends EvaluationPlugin>(jsonDocument: JsonDocument, id: string) {
    const schemaEvaluation = await this.validate(jsonDocument);
    return schemaEvaluation.plugins.get(id) as PluginType | undefined;
  }

  async getSchemaErrors(jsonDocument: JsonDocument) {
    const schemaEvaluation = await this.validate(jsonDocument);
    return schemaEvaluation.result;
  }

  async getSchemaUri(jsonDocument: JsonDocument) {
    const schemaNode = jsonDocument.findNodeAtPointer("/$schema");
    if (schemaNode) {
      try {
        return resolveIri(schemaNode.value, jsonDocument.uri);
      } catch {
        return schemaNode.value as string;
      }
    } else {
      for (const { url, matcher } of await this.catalogMatchers) {
        for (const workspaceUri of this.workspace.workspaceFolders) {
          if (!jsonDocument.uri.startsWith(workspaceUri + "/")) {
            continue;
          }

          const relativePath = toRelativeIri(workspaceUri + "/", jsonDocument.uri);
          if (matcher.ignores(relativePath)) {
            return url;
          }
        }
      }
    }
  }

  private async validate(jsonDocument: JsonDocument): Promise<SchemaEvaluation> {
    const version = jsonDocument.version;
    const schemaUri = await this.getSchemaUri(jsonDocument);

    let compiledSchema: CompiledSchema | undefined;
    if (schemaUri) {
      await this.scanCompleted;

      if (!this.compiledSchemaCache.has(schemaUri)) {
        this.compiledSchemaCache.set(schemaUri, (async () => {
          const startTime = performance.now();
          const schema = await getSchema(schemaUri);
          const compiledSchema = await compile(schema);
          this.server.console.log(`compile schema for ${abbreviateUri(schemaUri)} (${(performance.now() - startTime).toFixed(2)}ms)`);
          return compiledSchema;
        })());
      }

      compiledSchema = await this.compiledSchemaCache.get(schemaUri);
    }

    // The document was edited while waiting
    if (jsonDocument.version !== version) {
      return this.validate(jsonDocument);
    }

    // An evaluation is current as long as the document hasn't been edited and
    // the compiled schema hasn't changed
    const cached = this.evaluationCache.get(jsonDocument);
    if (cached?.version === version && cached.compiledSchema === compiledSchema) {
      return cached;
    }

    const plugins = new Map<string, EvaluationPlugin>();
    for (const [id, factory] of this.pluginFactories) {
      plugins.set(id, factory(jsonDocument));
    }

    let result: ValidationResult | undefined;
    if (schemaUri && compiledSchema) {
      const instance = jsonc.parse(jsonDocument.getText());
      const startTime = performance.now();
      result = evaluateCompiledSchema(compiledSchema, instance, { plugins: [...plugins.values()] });
      this.server.console.log(`validate ${abbreviateUri(jsonDocument.uri)} against schema ${abbreviateUri(schemaUri)} (${(performance.now() - startTime).toFixed(2)}ms)`);
    }

    const schemaEvaluation = { version, schemaUri, compiledSchema, plugins, result };
    this.evaluationCache.set(jsonDocument, schemaEvaluation);
    return schemaEvaluation;
  }

  async isStale(jsonDocument: JsonDocument) {
    const cached = this.evaluationCache.get(jsonDocument);
    if (!cached || cached.version !== jsonDocument.version) {
      return true;
    }

    if (!cached.schemaUri) {
      return false;
    }

    try {
      return await this.compiledSchemaCache.get(cached.schemaUri) !== cached.compiledSchema;
    } catch {
      return true;
    }
  }

  private async clear(fileUri: string) {
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
