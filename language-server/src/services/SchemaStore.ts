import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { compile, getSchema } from "@hyperjump/json-schema/experimental";
import { evaluateCompiledSchema } from "@hyperjump/json-schema-errors";
import { addUriSchemePlugin, httpSchemePlugin } from "@hyperjump/browser";
import { normalizeIri } from "@hyperjump/uri";
import * as Pact from "@hyperjump/pact";
import { abbreviateUri } from "../util/utils.ts";
import { isMatch } from "picomatch";

import type { CompiledSchema } from "@hyperjump/json-schema/experimental";
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
  private catalog: Promise<SchemaStoreEntry[] | undefined> = Promise.resolve(undefined);

  constructor(server: Server, workspace: Workspace) {
    this.server = server;
    this.workspace = workspace;

    server.onInitialized(async () => {
      const response = await fetch("https://www.schemastore.org/api/json/catalog.json");
      this.catalog = response.json().then((data) => data.schemas);

      const schemaAllowList = this.catalog.then((catalog) => {
        return Pact.pipe(
          catalog ?? [],
          Pact.map((entry: { url: string }) => entry.url),
          Pact.collectSet
        );
      });

      const uriSchemePlugin: UriSchemePlugin = {
        async retrieve(uri: string) {
          if (!(await schemaAllowList).has(uri)) {
            throw Error(`Only schemas in the SchemaStore.org registry can be retrieved over HTTP.`);
          }

          return httpSchemePlugin.retrieve(uri);
        }
      };

      addUriSchemePlugin("http", uriSchemePlugin);
      addUriSchemePlugin("https", uriSchemePlugin);
    });

    workspace.onDidChangeWatchedFiles(async (params) => {
      for (const change of params.changes) {
        const changedSchemaUri = normalizeIri(change.uri);
        await this.clear(changedSchemaUri);
      }
    });
  }

  async getSchemaUri(fileUri: string) {
    const catalog = await this.catalog;
    if (!catalog) {
      return;
    }

    const filePath = fileURLToPath(fileUri);

    for (const schema of catalog) {
      const { fileMatch, url } = schema;
      if (!fileMatch) {
        continue;
      }

      for (const pattern of fileMatch) {
        for (const workspaceUri of this.workspace.workspaceFolders) {
          const workspacePath = fileURLToPath(workspaceUri);
          if (!filePath.startsWith(workspacePath)) {
            continue;
          }

          if (isMatch(path.relative(workspacePath, filePath), pattern)) {
            return url;
          }
        }
      }
    }
  }

  async validate(schemaUri: string, instance: Json, instanceUri: string) {
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
    const result = evaluateCompiledSchema(compiledSchema, instance);
    this.server.console.log(`validate ${abbreviateUri(instanceUri)} against schema ${abbreviateUri(schemaUri)} (${(performance.now() - startTime).toFixed(2)}ms)`);
    return result;
  }

  async getDependentSchemaUris(schemaUri: string) {
    const compiledSchemaPromise = this.compiledSchemaCache.get(schemaUri);
    if (compiledSchemaPromise === undefined) {
      return undefined;
    }
    const compiledSchema = await compiledSchemaPromise;
    return this.getDependenencies(compiledSchema);
  }

  async clear(schemaUri: string) {
    for (const [cachedSchemaUri, compiledSchema] of this.compiledSchemaCache) {
      const dependentSchemas = this.getDependenencies(await compiledSchema);
      if (dependentSchemas.has(schemaUri)) {
        this.server.console.log(`clear schema cache for ${abbreviateUri(cachedSchemaUri)}`);
        this.compiledSchemaCache.delete(cachedSchemaUri);
      }
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
