import { compile, getSchema } from "@hyperjump/json-schema/experimental";
import { evaluateCompiledSchema } from "@hyperjump/json-schema-errors";
import { normalizeIri } from "@hyperjump/uri";
import { abbreviateUri } from "../util/utils.ts";
import { URI } from "vscode-uri";
import { isMatch } from "picomatch";

import type { CompiledSchema } from "@hyperjump/json-schema/experimental";
import type { Json } from "@hyperjump/json-schema-errors";
import type { Server } from "../services/server.ts";

export class SchemaStore {
  private server: Server;
  private compiledSchemaCache: Map<string, CompiledSchema> = new Map();
  private catalog: Array<{ fileMatch?: string[]; url: string }> | undefined;

  constructor(server: Server) {
    this.server = server;

    server.onDidChangeWatchedFiles((params) => {
      for (const change of params.changes) {
        const changedSchemaUri = normalizeIri(change.uri);
        this.clear(changedSchemaUri);
      }
    });
  }

  async getSchemaUri(uriOrFileName: string): Promise<string | undefined> {
    await this.getCatalog();

    if (!this.catalog) {
      return undefined;
    }

    const parsedUri = URI.parse(uriOrFileName);
    const effectiveFileName = parsedUri.path.split("/").pop() ?? "";

    for (const schema of this.catalog) {
      const { fileMatch, url } = schema;
      if (!fileMatch) {
        continue;
      }
      for (const pattern of fileMatch) {
        if (isMatch(effectiveFileName, pattern)) {
          return url;
        }
      }
    }
    return undefined;
  }

  private async getCatalog() {
    if (!this.catalog) {
      const response = await fetch("https://www.schemastore.org/api/json/catalog.json");
      const data = await response.json();
      this.catalog = data.schemas;
    }
    return this.catalog;
  }

  async validate(schemaUri: string, instance: Json) {
    if (!this.compiledSchemaCache.has(schemaUri)) {
      const startTime = performance.now();
      const schema = await getSchema(schemaUri);
      const compiledSchema = await compile(schema);
      this.server.console.log(`compile schema for ${abbreviateUri(schemaUri)} (${(performance.now() - startTime).toFixed(2)}ms)`);

      this.compiledSchemaCache.set(schemaUri, compiledSchema);
    }
    const compiledSchema = this.compiledSchemaCache.get(schemaUri)!;

    return evaluateCompiledSchema(compiledSchema, instance);
  }

  getDependentSchemaUris(schemaUri: string) {
    const compiledSchema = this.compiledSchemaCache.get(schemaUri);
    if (compiledSchema === undefined) {
      return undefined;
    }
    return this.getDependenencies(compiledSchema);
  }

  clear(schemaUri: string) {
    for (const [cachedSchemaUri, compiledSchema] of this.compiledSchemaCache) {
      const dependentSchemas = this.getDependenencies(compiledSchema);
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
