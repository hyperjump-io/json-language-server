import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compile, getSchema, getKeywordName } from "@hyperjump/json-schema/experimental";
import { registerSchema, unregisterSchema } from "@hyperjump/json-schema";
import { evaluateCompiledSchema } from "@hyperjump/json-schema-errors";
import { addUriSchemePlugin, httpSchemePlugin } from "@hyperjump/browser";
import { normalizeIri } from "@hyperjump/uri";
import * as jsonc from "jsonc-parser";
import * as Pact from "@hyperjump/pact";
import ignore from "ignore";
import { FileChangeType } from "vscode-languageserver";
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
  private workspaceSchemaUris: Map<string, string> = new Map();
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

    this.scanCompleted = new Promise((resolve) => {
      server.onInitialized(async () => {
        await this.scanWorkspace();
        resolve();
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
        if (change.type !== FileChangeType.Deleted) {
          await this.processWorkspaceSchemaFile(changedSchemaUri);
        }
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

  async clear(schemaUri: string) {
    for (const [cachedSchemaUri, compiledSchema] of this.compiledSchemaCache) {
      try {
        const dependentSchemas = this.getDependenencies(await compiledSchema);
        const actualSchemaUri = this.workspaceSchemaUris.get(schemaUri) ?? schemaUri;
        if (!dependentSchemas.has(actualSchemaUri)) {
          continue;
        }
      } catch {
      }

      this.server.console.log(`clear schema cache for ${abbreviateUri(cachedSchemaUri)}`);
      this.compiledSchemaCache.delete(cachedSchemaUri);
      unregisterSchema(cachedSchemaUri);
      this.workspaceSchemaUris.delete(cachedSchemaUri);
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

  private async scanWorkspace() {
    this.server.console.log("Scanning workspace for self-identifying schemas...");
    for (const folderUri of this.workspace.workspaceFolders) {
      const dirPath = fileURLToPath(folderUri);

      const ig = ignore();
      try {
        const gitignorePath = path.join(dirPath, ".gitignore");
        const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
        ig.add(gitignoreContent);
      } catch {
        // Ignore if .gitignore does not exist
      }

      const globOptions = {
        cwd: dirPath,
        exclude: [".git/"]
      };
      for await (const entry of (fs as any).glob("**/*.{json,jsonc}", globOptions)) {
        if (ig.ignores(entry)) {
          continue;
        }
        const fullPath = path.join(dirPath, entry);
        const fileUri = pathToFileURL(fullPath).toString();
        await this.processWorkspaceSchemaFile(fileUri);
      }
    }
    this.server.console.log("Scanning completed");
  }

  private async processWorkspaceSchemaFile(fileUri: string) {
    const filePath = fileURLToPath(fileUri);
    try {
      const text = await fs.readFile(filePath, "utf-8");
      const schemaObject = jsonc.parse(text);
      if (typeof schemaObject !== "object" || schemaObject === null || Array.isArray(schemaObject)) {
        return;
      }

      const dialectId = schemaObject?.["$schema"];
      if (typeof dialectId === "string") {
        const idKeyword = getKeywordName(dialectId, "https://json-schema.org/keyword/id")
          || getKeywordName(dialectId, "https://json-schema.org/keyword/draft-04/id");

        if (idKeyword) {
          const id = schemaObject[idKeyword];
          if (typeof id === "string") {
            unregisterSchema(id);
            registerSchema(schemaObject);
            this.workspaceSchemaUris.set(fileUri, id);

            this.server.console.log(`Registered local schema: ${id} (from ${fileUri})`);
          }
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.server.console.error(`Failed to process local schema at ${fileUri}: ${message}`);
    }
  }
}
