import { TextDocuments, TextDocumentSyncKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

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

  return server;
};
