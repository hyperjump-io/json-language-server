import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, getSchema } from "@hyperjump/json-schema/experimental";
import { evaluateCompiledSchema } from "@hyperjump/json-schema-errors";
import { addUriSchemePlugin, httpSchemePlugin } from "@hyperjump/browser";
import { normalizeIri } from "@hyperjump/uri";
import * as Pact from "@hyperjump/pact";
import ignore from "ignore";
import { abbreviateUri } from "../util/utils.ts";

import type { CompiledSchema, EvaluationPlugin } from "@hyperjump/json-schema/experimental";
import type { Json } from "@hyperjump/json-schema-errors";
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

    const schemaAllowList = this.catalog.then((catalog) => {
      return Pact.pipe(
        catalog,
        Pact.map((entry: { url: string }) => entry.url),
        Pact.collectSet
      );
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

    workspace.onDidChangeWatchedFiles(async (params) => {
      for (const change of params.changes) {
        const changedSchemaUri = normalizeIri(change.uri);
        await this.clear(changedSchemaUri);
      }
    });
  }

  async getSchemaUri(fileUri: string) {
    const filePath = fileURLToPath(fileUri);

    for (const schema of await this.catalog) {
      const { fileMatch, url } = schema;
      if (!fileMatch) {
        continue;
      }

      const ig = ignore().add(fileMatch);
      for (const workspaceUri of this.workspace.workspaceFolders) {
        const workspacePath = fileURLToPath(workspaceUri);
        if (!filePath.startsWith(workspacePath)) {
          continue;
        }

        const relativePath = path.relative(workspacePath, filePath);
        if (ig.ignores(relativePath)) {
          return url;
        }
      }
    }
  }

  async validate(schemaUri: string, instance: Json, instanceUri: string, plugins: EvaluationPlugin[] = []) {
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

  async clear(schemaUri: string) {
    for (const [cachedSchemaUri, compiledSchema] of this.compiledSchemaCache) {
      try {
        const dependentSchemas = this.getDependenencies(await compiledSchema);
        if (!dependentSchemas.has(schemaUri)) {
          continue;
        }
      } catch {
      }

      this.server.console.log(`clear schema cache for ${abbreviateUri(cachedSchemaUri)}`);
      this.compiledSchemaCache.delete(cachedSchemaUri);
    }
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
}
