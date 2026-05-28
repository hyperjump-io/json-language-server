import { TextDocuments, TextDocumentSyncKind, Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";
import { Server } from "../services/server.ts";

import type { ServerCapabilities } from "vscode-languageserver";

export class JsonValidation {
  constructor(server: Server, documents: TextDocuments<TextDocument>) {
    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        textDocumentSync: TextDocumentSyncKind.Incremental
      };

      return {
        capabilities: serverCapabilities
      };
    });

    documents.onDidChangeContent(async (change) => {
      const textDocument = change.document;
      const text = textDocument.getText();
      const parseErrors: jsonc.ParseError[] = [];

      jsonc.parseTree(text, parseErrors);

      // for syntax errors
      const syntaxDiagnostics: Diagnostic[] = parseErrors.map((error) => ({
        severity: DiagnosticSeverity.Error,
        range: {
          start: textDocument.positionAt(error.offset),
          end: textDocument.positionAt(error.offset + error.length)
        },
        message: jsonc.printParseErrorCode(error.error),
        source: "json-language-server"
      }));

      void server.sendDiagnostics({
        uri: textDocument.uri,
        diagnostics: [...syntaxDiagnostics]
      });
    });
  }
}
