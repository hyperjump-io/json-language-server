import "@hyperjump/json-schema/draft-2020-12";
import { TextDocuments } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Server } from "./services/server.ts";
import { JsonValidation } from "./features/JsonValidation.ts";

import type { Connection } from "vscode-languageserver";

export type LanguageServerSettings = {
};

export const buildServer = (connection: Connection): Connection => {
  const server = new Server(connection);

  const documents = new TextDocuments(TextDocument);
  documents.listen(server);

  new JsonValidation(server, documents);

  return server;
};
