import "@hyperjump/json-schema/draft-2020-12";
import { TextDocuments, TextDocumentSyncKind, Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";

import type { ServerCapabilities, Connection } from "vscode-languageserver";

export type LanguageServerSettings = {
};

export const buildServer = (server: Connection): Connection => {
  const documents = new TextDocuments(TextDocument);
  documents.listen(server);

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

    // for syntax error
    const syntaxDiagnostics: Diagnostic[] = parseErrors.map((error) => ({
      severity: DiagnosticSeverity.Error,
      range: {
        start: textDocument.positionAt(error.offset),
        end: textDocument.positionAt(error.offset + error.length)
      },
      message: jsonc.printParseErrorCode(error.error),
      source: "json-language-server"
    }));

    void server.sendDiagnostics({ uri: textDocument.uri, diagnostics: [...syntaxDiagnostics] });
  });

  return server;
};
