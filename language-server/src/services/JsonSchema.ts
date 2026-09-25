import { addMediaTypePlugin, addUriSchemePlugin, getFileMediaType, httpSchemePlugin } from "@hyperjump/browser";
import { buildSchemaDocument, compile, getSchema } from "@hyperjump/json-schema/experimental";
import { evaluateCompiledSchema } from "@hyperjump/json-schema-errors";
import { parseIri, toAbsoluteIri } from "@hyperjump/uri";
import { abbreviateUri } from "../util/utils.ts";

import "@hyperjump/json-schema/draft-2020-12";
import "@hyperjump/json-schema/draft-2019-09";
import "@hyperjump/json-schema/draft-07";
import "@hyperjump/json-schema/draft-06";
import "@hyperjump/json-schema/draft-04";
import "../vscode-vocabulary.ts";

import type { CompiledSchema, EvaluationPlugin } from "@hyperjump/json-schema/experimental";
import type { UriSchemePlugin } from "@hyperjump/browser";
import type { ValidationResult } from "@hyperjump/json-schema-errors";
import type { JsonDocuments } from "./JsonDocuments.ts";
import type { JsonDocument } from "../models/JsonDocument.ts";
import type { JsonSchemaRegistry } from "./JsonSchemaRegistry.ts";
import type { Server } from "./Server.ts";
import type { Workspace } from "./Workspace.ts";

type EvaluationPluginFactory = (jsonDocument: JsonDocument) => EvaluationPlugin;

type SchemaEvaluation = ValidationResult & {
  plugins: Map<string, EvaluationPlugin>;
};

type DidChangeDocumentSchemaHandler = (params: DidChangeDocumentSchemaParams) => Promise<void> | void;
type DidChangeDocumentSchemaParams = {
  document: JsonDocument;
};

export class JsonSchema {
  private server: Server;
  private registry: JsonSchemaRegistry;
  private fileSchemaUris: Map<string, Promise<string | undefined>> = new Map();
  private pluginFactories: Map<string, EvaluationPluginFactory> = new Map();
  private compiledSchemaCache: Map<string, Promise<CompiledSchema>> = new Map();
  private validationCache: Map<string, SchemaEvaluation> = new Map();
  private didChangeDocumentSchemaHandlers: Set<DidChangeDocumentSchemaHandler> = new Set();

  constructor(server: Server, workspace: Workspace, jsonDocuments: JsonDocuments, registry: JsonSchemaRegistry) {
    this.server = server;
    this.registry = registry;

    addMediaTypePlugin("application/json", {
      parse: async (response) => {
        return buildSchemaDocument(await response.json(), response.url);
      },
      fileMatcher: async (path) => path.endsWith(".json")
    });

    const uriSchemePlugin: UriSchemePlugin = {
      async retrieve(uri: string) {
        if (!(await registry.has(uri)) && !uri.startsWith("https://json.schemastore.org")) {
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

    jsonDocuments.onDidChangeContent(async (params) => {
      this.validationCache.delete(params.document.uri);
    });

    jsonDocuments.onDidClose(async (params) => {
      this.validationCache.delete(params.document.uri);
      this.fileSchemaUris.delete(params.document.uri);
    });

    registry.onDidChangeSchema(async ({ schemaUri }) => {
      const changedSchemaUris = new Set<string>();
      for (const [cachedSchemaUri, compiledSchema] of this.compiledSchemaCache) {
        if (cachedSchemaUri === schemaUri || await this.dependsOn(compiledSchema, schemaUri)) {
          this.compiledSchemaCache.delete(cachedSchemaUri);
          changedSchemaUris.add(cachedSchemaUri);
          this.server.console.log(`clear schema cache for ${abbreviateUri(cachedSchemaUri)}`);
        }
      }

      for (const jsonDocument of jsonDocuments.all()) {
        const documentSchemaUri = await this.getSchemaUri(jsonDocument);
        if (!documentSchemaUri || !changedSchemaUris.has(documentSchemaUri)) {
          continue;
        }

        this.validationCache.delete(jsonDocument.uri);
        for (const handler of this.didChangeDocumentSchemaHandlers) {
          await handler({ document: jsonDocument });
        }
      }
    });
  }

  onDidChangeDocumentSchema(handler: DidChangeDocumentSchemaHandler) {
    this.didChangeDocumentSchemaHandlers.add(handler);
  }

  registerPlugin(id: string, factory: EvaluationPluginFactory) {
    this.pluginFactories.set(id, factory);
  }

  async getSchemaUri(jsonDocument: JsonDocument) {
    const documentSchemaUri = jsonDocument.getSchemaUri();
    if (documentSchemaUri) {
      return documentSchemaUri;
    }

    // Matching against the catalog is expensive and only depends on the URI
    if (!this.fileSchemaUris.has(jsonDocument.uri)) {
      this.fileSchemaUris.set(jsonDocument.uri, this.registry.matchSchemaUri(jsonDocument.uri));
    }
    return this.fileSchemaUris.get(jsonDocument.uri);
  }

  async validate(jsonDocument: JsonDocument): Promise<SchemaEvaluation> {
    if (!this.validationCache.has(jsonDocument.uri)) {
      const version = jsonDocument.version;
      const schemaUri = await this.getSchemaUri(jsonDocument);

      let compiledSchemaPromise: Promise<CompiledSchema> | undefined;
      let compiledSchema: CompiledSchema | undefined;
      if (schemaUri) {
        // The schema might be a workspace schema that hasn't been registered yet
        await this.registry.ready;

        if (!this.compiledSchemaCache.has(schemaUri)) {
          this.compiledSchemaCache.set(schemaUri, (async () => {
            const startTime = performance.now();
            const schema = await getSchema(schemaUri);
            const compiledSchema = await compile(schema);
            this.server.console.log(`compile schema for ${abbreviateUri(schemaUri)} (${(performance.now() - startTime).toFixed(2)}ms)`);
            return compiledSchema;
          })());
        }

        compiledSchemaPromise = this.compiledSchemaCache.get(schemaUri);
        compiledSchema = await compiledSchemaPromise;
      }

      // The document or its schema changed while waiting. Caching this result
      // would overwrite or outlive the invalidation.
      if (jsonDocument.version !== version || (schemaUri && this.compiledSchemaCache.get(schemaUri) !== compiledSchemaPromise)) {
        return this.validate(jsonDocument);
      }

      let result: ValidationResult | undefined;
      const plugins = new Map<string, EvaluationPlugin>();
      if (schemaUri && compiledSchema) {
        for (const [id, factory] of this.pluginFactories) {
          plugins.set(id, factory(jsonDocument));
        }

        const node = jsonDocument.findNodeAtPointer("")!;
        const instance = jsonDocument.getNodeValue(node);
        const startTime = performance.now();
        result = evaluateCompiledSchema(compiledSchema, instance, { plugins: [...plugins.values()] });
        this.server.console.log(`validate ${abbreviateUri(jsonDocument.uri)} against schema ${abbreviateUri(schemaUri)} (${(performance.now() - startTime).toFixed(2)}ms)`);
        this.validationCache.set(jsonDocument.uri, { ...result, plugins });
      }
    }

    return this.validationCache.get(jsonDocument.uri)!;
  }

  private async dependsOn(compiledSchema: Promise<CompiledSchema>, schemaUri: string) {
    try {
      const { ast } = await compiledSchema;
      return Object.keys(ast).some((key) => {
        return key !== "metaData" && key !== "plugins" && toAbsoluteIri(key) === schemaUri;
      });
    } catch {
      // A schema that failed to compile might be fixed by this change
      return true;
    }
  }
}
