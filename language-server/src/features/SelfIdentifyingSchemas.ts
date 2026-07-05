import { promises as fs } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as jsonc from "jsonc-parser";
import { registerSchema, unregisterSchema } from "@hyperjump/json-schema";
import { Server } from "../services/Server.ts";
import { SchemaStore } from "../services/SchemaStore.ts";
import { Workspace } from "../services/Workspace.ts";

import type { FileChangeType } from "vscode-languageserver";

export class SelfIdentifyingSchemas {
  private server: Server;
  private workspace: Workspace;
  private schemaStore: SchemaStore;
  private registeredSchemas: Map<string, { id: string; fileUri: string }> = new Map();
  private workspaceFolders: string[] = [];

  constructor(server: Server, workspace: Workspace, schemaStore: SchemaStore) {
    this.server = server;
    this.workspace = workspace;
    this.schemaStore = schemaStore;

    server.onInitialize((params) => {
      if (params.workspaceFolders) {
        this.workspaceFolders = params.workspaceFolders.map((folder) => folder.uri);
      } else if (params.rootUri) {
        this.workspaceFolders = [params.rootUri];
      }
      return { capabilities: {} };
    });

    server.onInitialized(async () => {
      await this.scanWorkspace();
    });

    workspace.onDidChangeWatchedFiles(async (params) => {
      for (const change of params.changes) {
        const fileUri = change.uri;
        if (!fileUri.endsWith(".json") && !fileUri.endsWith(".jsonc")) {
          continue;
        }

        // change.type is: 1 = Created, 2 = Changed, 3 = Deleted
        const changeType = change.type as FileChangeType;

        if (changeType === 3) {
          await this.unregister(fileUri);
        } else {
          await this.processFile(fileUri);
        }
      }
    });
  }

  private async scanWorkspace() {
    this.server.console.log("Scanning workspace for self-identifying schemas...");
    for (const folderUri of this.workspaceFolders) {
      if (!folderUri.startsWith("file://")) {
        continue;
      }
      const dirPath = fileURLToPath(folderUri);
      await this.scanDirectory(dirPath);
    }
    this.server.console.log(`Scanning completed. Registered ${this.registeredSchemas.size} local schemas.`);
  }

  private async scanDirectory(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") {
          continue;
        }
        await this.scanDirectory(fullPath);
      } else if (entry.isFile()) {
        if (entry.name.endsWith(".json") || entry.name.endsWith(".jsonc")) {
          const fileUri = pathToFileURL(fullPath).toString();
          await this.processFile(fileUri);
        }
      }
    }
  }

  private async processFile(fileUri: string) {
    await this.unregister(fileUri);

    if (!fileUri.startsWith("file://")) {
      return;
    }

    const filePath = fileURLToPath(fileUri);
    try {
      const text = await fs.readFile(filePath, "utf-8");
      const ast = jsonc.parseTree(text);
      if (!ast || ast.type !== "object") {
        return;
      }

      const schemaNode = jsonc.findNodeAtLocation(ast, ["$schema"]);
      const idNode = jsonc.findNodeAtLocation(ast, ["$id"]);

      if (
        schemaNode && schemaNode.type === "string" && idNode && idNode.type === "string"
      ) {
        const schemaObject = jsonc.parse(text);
        const id = idNode.value;

        try {
          unregisterSchema(id);
        } catch {
          // Ignore if not registered
        }

        registerSchema(schemaObject, id);
        this.registeredSchemas.set(fileUri, { id, fileUri });
        this.schemaStore.registerWorkspaceSchema(fileUri, id);

        this.server.console.log(`Registered local schema: ${id} (from ${fileUri})`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.server.console.error(`Failed to process local schema at ${fileUri}: ${message}`);
    }
  }

  private async unregister(fileUri: string) {
    const registered = this.registeredSchemas.get(fileUri);
    if (registered) {
      try {
        unregisterSchema(registered.id);
      } catch {
        // Ignore if not registered
      }
      this.registeredSchemas.delete(fileUri);
      this.schemaStore.unregisterWorkspaceSchema(fileUri);

      await this.schemaStore.clear(registered.id);

      this.server.console.log(`Unregistered local schema: ${registered.id}`);
    }
  }
}
