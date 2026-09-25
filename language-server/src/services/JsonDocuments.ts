import { TextDocuments, TextDocumentSyncKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { JsonDocument } from "../models/JsonDocument.ts";
import { Server } from "./Server.ts";
import { abbreviateUri } from "../util/utils.ts";

import type { DocumentUri, ServerCapabilities, TextDocumentContentChangeEvent } from "vscode-languageserver";

export class JsonDocuments extends TextDocuments<JsonDocument> {
  constructor(server: Server) {
    super({
      create: (uri: DocumentUri, languageId: string, version: number, content: string) => {
        server.console.log(`validate ${abbreviateUri(uri)} JSON syntax`);
        const textDocument = TextDocument.create(uri, languageId, version, content);
        return new JsonDocument(textDocument);
      },
      update(document: JsonDocument, changes: TextDocumentContentChangeEvent[], version: number) {
        server.console.log(`validate ${abbreviateUri(document.uri)} JSON syntax`);
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
}
