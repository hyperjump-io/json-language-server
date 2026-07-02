import { Server } from "./services/Server.ts";
import { JsonDocuments } from "./services/JsonDocuments.ts";
import { SchemaStore } from "./services/SchemaStore.ts";
import { Diagnostics } from "./features/Diagnostics.ts";
import { SyntaxValidation } from "./features/SyntaxValidation.ts";
import { SchemaValidation } from "./features/SchemaValidation.ts";
import { Formatting } from "./features/Formatting.ts";
import { SelfIdentifyingSchemas } from "./features/SelfIdentifyingSchemas.ts";

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

  new Formatting(server, documents);

  new SelfIdentifyingSchemas(server, schemaStore);

  new Diagnostics(server, documents, [
    new SyntaxValidation(),
    new SchemaValidation()
  ]);

  return server;
};
