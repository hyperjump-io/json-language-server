import * as Pact from "@hyperjump/pact";

import type { DocumentLink, ServerCapabilities } from "vscode-languageserver";
import type { Server } from "../services/Server.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";
import type { JsonSchemaRegistry } from "../services/JsonSchemaRegistry.ts";
import type { Workspace } from "../services/Workspace.ts";

export class DocumentLinks {
  private jsonDocuments: JsonDocuments;
  private workspace: Workspace;
  private registry: JsonSchemaRegistry;

  constructor(server: Server, jsonDocuments: JsonDocuments, workspace: Workspace, registry: JsonSchemaRegistry) {
    this.jsonDocuments = jsonDocuments;
    this.workspace = workspace;
    this.registry = registry;

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

      const schemaUri = jsonDocument.getSchemaUri();
      if (!schemaUri) {
        return [];
      }

      // The schema might be a workspace schema that hasn't been registered yet
      await this.registry.ready;

      const target = this.registry.getFileUri(schemaUri) ?? schemaUri;
      const isWorkspaceSchema = Pact.some((workspaceFolderUri) => target.startsWith(`${workspaceFolderUri}/`), this.workspace.workspaceFolders);
      if (!isWorkspaceSchema) {
        return [];
      }

      const link: DocumentLink = {
        target,
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
