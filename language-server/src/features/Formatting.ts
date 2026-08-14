import { EOL } from "node:os";
import * as jsonc from "jsonc-parser";

import type { ServerCapabilities, DocumentFormattingParams, DocumentRangeFormattingParams } from "vscode-languageserver";
import type { Server } from "../services/Server.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";

export class Formatting {
  private server: Server;
  private jsonDocuments: JsonDocuments;

  constructor(server: Server, jsonDocuments: JsonDocuments) {
    this.server = server;
    this.jsonDocuments = jsonDocuments;

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        documentFormattingProvider: true,
        documentRangeFormattingProvider: true
      };
      return { capabilities: serverCapabilities };
    });

    server.onDocumentFormatting((params) => {
      return this.format(params);
    });

    server.onDocumentRangeFormatting((params) => {
      return this.format(params);
    });
  }

  private format(params: DocumentFormattingParams | DocumentRangeFormattingParams) {
    const jsonDocument = this.jsonDocuments.get(params.textDocument.uri);
    if (!jsonDocument) {
      return;
    }

    let range: jsonc.Range | undefined;
    if ("range" in params) {
      const startOffset = jsonDocument.offsetAt(params.range.start);
      const endOffset = jsonDocument.offsetAt(params.range.end);
      range = {
        offset: startOffset,
        length: endOffset - startOffset
      };
    }

    try {
      const text = jsonDocument.getText();

      const edits = jsonc.format(text, range, {
        tabSize: params.options.tabSize,
        insertSpaces: params.options.insertSpaces,
        insertFinalNewline: true,
        eol: EOL
      });

      return edits.map((edit) => ({
        range: jsonDocument.rangeAt(edit.offset, edit.offset + edit.length),
        newText: edit.content
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.server.console.error(`Failed to format ${range ? "range" : "document"}: ${message}`);
    }
  }
}
