import * as Pact from "@hyperjump/pact";

import type { DocumentLink, ServerCapabilities } from "vscode-languageserver";
import type { Server } from "../services/Server.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";
import type { Workspace } from "../services/Workspace.ts";
import type { SchemaStore } from "../services/SchemaStore.ts";

export class DocumentLinks {
  private jsonDocuments: JsonDocuments;
  private workspace: Workspace;
  private schemaStore: SchemaStore;

  constructor(server: Server, jsonDocuments: JsonDocuments, workspace: Workspace, schemaStore: SchemaStore) {
    this.jsonDocuments = jsonDocuments;
    this.workspace = workspace;
    this.schemaStore = schemaStore;

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        documentLinkProvider: {}
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onDocumentLinks(async (params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri)!;

      const schemaNode = jsonDocument.findNodeAtPointer("/$schema");
      if (schemaNode?.type !== "string") {
        return [];
      }

      const schemaUri = await this.schemaStore.getSchemaUri(jsonDocument);
      if (!schemaUri) {
        return [];
      }

      const isWorkspaceSchema = Pact.some((workspaceFolderUri) => schemaUri.startsWith(`${workspaceFolderUri}/`), this.workspace.workspaceFolders);
      if (!isWorkspaceSchema) {
        return [];
      }

      const link: DocumentLink = {
        target: schemaUri,
        tooltip: "Goto Schema",
        range: {
          start: jsonDocument.positionAt(schemaNode.offset + 1),
          end: jsonDocument.positionAt(schemaNode.offset + schemaNode.length - 1)
        }
      };

      return [link];
    });
  }
}
