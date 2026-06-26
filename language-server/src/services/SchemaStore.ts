import { compile, getSchema } from "@hyperjump/json-schema/experimental";
import { evaluateCompiledSchema } from "@hyperjump/json-schema-errors";
import { normalizeIri } from "@hyperjump/uri";
import { abbreviateUri } from "../util/utils.ts";

import type { CompiledSchema } from "@hyperjump/json-schema/experimental";
import type { Json } from "@hyperjump/json-schema-errors";
import type { Server } from "../services/Server.ts";

export class SchemaStore {
  private server: Server;
  private compiledSchemaCache: Map<string, CompiledSchema> = new Map();

  constructor(server: Server) {
    this.server = server;

    server.onDidChangeWatchedFiles((params) => {
      for (const change of params.changes) {
        const changedSchemaUri = normalizeIri(change.uri);
        this.clear(changedSchemaUri);
      }
    });
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
