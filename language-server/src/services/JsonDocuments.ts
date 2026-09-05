import { TextDocuments, TextDocumentSyncKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { JsonDocument } from "../models/JsonDocument.ts";
import { Server } from "./Server.ts";

import type { Disposable, DocumentUri, ServerCapabilities, TextDocumentContentChangeEvent } from "vscode-languageserver";
import type { SchemaStore } from "./SchemaStore.ts";

export class JsonDocuments extends TextDocuments<JsonDocument> {
  private didCreateListeners: Set<(jsonDocument: JsonDocument) => void> = new Set();

  constructor(server: Server, schemaStore: SchemaStore) {
    super({
      create: (uri: DocumentUri, languageId: string, version: number, content: string) => {
        const textDocument = TextDocument.create(uri, languageId, version, content);
        const jsonDocument = new JsonDocument(textDocument, schemaStore, server);
        for (const listener of this.didCreateListeners) {
          listener(jsonDocument);
        }
        return jsonDocument;
      },
      update(document: JsonDocument, changes: TextDocumentContentChangeEvent[], version: number) {
        document.update(changes, version);
        return document;
      }
    });

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        textDocumentSync: TextDocumentSyncKind.Incremental
      };

      return {
        capabilities: serverCapabilities
      };
    });
  }

  onDidCreate(listener: (jsonDocument: JsonDocument) => void): Disposable {
    this.didCreateListeners.add(listener);
    return {
      dispose: () => {
        this.didCreateListeners.delete(listener);
      }
    };
  }
}
