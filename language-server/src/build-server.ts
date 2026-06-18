import { Server } from "./services/server.ts";
import { JsonDocuments } from "./services/JsonDocuments.ts";
import { SchemaStore } from "./services/SchemaStore.ts";
import { Diagnostics } from "./features/Diagnostics.ts";
import { SyntaxValidation } from "./features/SyntaxValidation.ts";
import { SchemaValidation } from "./features/SchemaValidation.ts";

import "@hyperjump/json-schema/draft-2020-12";
import "@hyperjump/json-schema/draft-2019-09";
import "@hyperjump/json-schema/draft-07";
import "@hyperjump/json-schema/draft-06";
import "@hyperjump/json-schema/draft-04";

import type { Connection } from "vscode-languageserver";

export type LanguageServerSettings = {
};

export const buildServer = (connection: Connection): Connection => {
  const server = new Server(connection);
  const schemaStore = new SchemaStore(server);

  const documents = new JsonDocuments(server, schemaStore);
  documents.listen(server);

  const diagnostics = new Diagnostics(server, documents, [
    new SyntaxValidation(),
    new SchemaValidation()
  ]);

  server.onDidChangeWatchedFiles(async (params) => {
    for (const change of params.changes) {
      schemaStore.clear(change.uri);
    }

    for (const document of documents.all()) {
      document.revalidate();
      await diagnostics.sendDiagnostics(document);
    }
  });

  documents.onDidChangeContent(async (change) => {
    const changedUri = change.document.uri;
    schemaStore.clear(changedUri);

    for (const document of documents.all()) {
      if (document.uri !== changedUri && document.getSchemaUri() === changedUri) {
        document.revalidate();
        await diagnostics.sendDiagnostics(document);
      }
    }
  });

  return server;
};
