import { normalizeIri, resolveIri } from "@hyperjump/uri";

import type { DocumentLink, ServerCapabilities } from "vscode-languageserver";
import type { Server } from "../services/Server.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";
import type { Workspace } from "../services/Workspace.ts";

export class DocumentLinks {
  private jsonDocuments: JsonDocuments;
  private workspace: Workspace;

  constructor(server: Server, jsonDocuments: JsonDocuments, workspace: Workspace) {
    this.jsonDocuments = jsonDocuments;
    this.workspace = workspace;

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        documentLinkProvider: {}
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onDocumentLinks((params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri)!;

      const schemaNode = jsonDocument.findNodeAtPointer("/$schema");
      if (schemaNode?.type !== "string") {
        return [];
      }

      let schemaUri: string;
      try {
        schemaUri = resolveIri(schemaNode.value as string, jsonDocument.uri);
      } catch {
        return [];
      }

      const isWorkspaceSchema = [...this.workspace.workspaceFolders].some((workspaceFolderUri) => {
        const normalized = normalizeIri(workspaceFolderUri);
        const prefix = normalized.endsWith("/") ? normalized : `${normalized}/`;
        return schemaUri.startsWith(prefix);
      });
      if (!isWorkspaceSchema) {
        return [];
      }

      const link: DocumentLink = {
        target: schemaUri,
        tooltip: "Click to open schema file",
        range: {
          start: jsonDocument.positionAt(schemaNode.offset + 1),
          end: jsonDocument.positionAt(schemaNode.offset + schemaNode.length - 1)
        }
      };

      return [link];
    });
  }
}
