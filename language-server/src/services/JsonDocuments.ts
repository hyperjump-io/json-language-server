import { DidChangeWatchedFilesNotification, TextDocuments, TextDocumentSyncKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { JsonDocument } from "../models/JsonDocument.ts";
import { Server } from "./server.ts";

import type { DocumentUri, ServerCapabilities, TextDocumentContentChangeEvent } from "vscode-languageserver";

export class JsonDocuments extends TextDocuments<JsonDocument> {
  private server: Server;
  private hasWorkspaceWatchCapability: boolean = false;

  constructor(server: Server) {
    super({
      create(uri: DocumentUri, languageId: string, version: number, content: string) {
        const textDocument = TextDocument.create(uri, languageId, version, content);
        return new JsonDocument(textDocument);
      },
      update(document: JsonDocument, changes: TextDocumentContentChangeEvent[], version: number) {
        document.update(changes, version);
        return document;
      }
    });

    this.server = server;

    server.onInitialize(({ capabilities }) => {
      this.hasWorkspaceWatchCapability = !!capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration;

      const serverCapabilities: ServerCapabilities = {
        textDocumentSync: TextDocumentSyncKind.Incremental
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onInitialized(async () => {
      if (this.hasWorkspaceWatchCapability) {
        await this.server.client.register(DidChangeWatchedFilesNotification.type, {
          watchers: [{ globPattern: "**/*" }]
        });
      }
    });
  }
}
