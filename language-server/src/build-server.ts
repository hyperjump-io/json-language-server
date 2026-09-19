import { Server } from "./services/Server.ts";
import { JsonDocuments } from "./services/JsonDocuments.ts";
import { SchemaStore } from "./services/SchemaStore.ts";
import { Workspace } from "./services/Workspace.ts";
import { Diagnostics } from "./features/diagnostics/Diagnostics.ts";
import { SyntaxValidationDiagnosticsProvider } from "./features/diagnostics/SyntaxValidationDiagnosticsProvider.ts";
import { SchemaValidationDiagnosticsProvider } from "./features/diagnostics/SchemaValidationDiagnosticsProvider.ts";
import { Formatting } from "./features/Formatting.ts";
import { Hover } from "./features/Hover.ts";
import { Completions } from "./features/completions/Completions.ts";
import { PropertyCompletionsProvider } from "./features/completions/PropertyCompletionsProvider.ts";
import { ValueCompletionsProvider } from "./features/completions/ValueCompletionsProvider.ts";
import { FoldingRanges } from "./features/FoldingRanges.ts";
import { DocumentSymbols } from "./features/DocumentSymbols.ts";
import { SelectionRanges } from "./features/SelectionRanges.ts";
import { DocumentLinks } from "./features/DocumentLinks.ts";
import { DocumentColors } from "./features/DocumentColors.ts";

import "@hyperjump/json-schema/draft-2020-12";
import "@hyperjump/json-schema/draft-2019-09";
import "@hyperjump/json-schema/draft-07";
import "@hyperjump/json-schema/draft-06";
import "@hyperjump/json-schema/draft-04";
import "./vscode-vocabulary.ts";

import type { Connection } from "vscode-languageserver";

export type LanguageServerSettings = {
};

export const buildServer = (connection: Connection): Server => {
  const server = new Server(connection);

  const workspace = new Workspace(server);
  const schemaStore = new SchemaStore(server, workspace);

  const documents = new JsonDocuments(server, schemaStore);
  documents.listen(server);

  new Diagnostics(server, documents, workspace, [
    new SyntaxValidationDiagnosticsProvider(),
    new SchemaValidationDiagnosticsProvider()
  ]);

  new Formatting(server, documents);
  new Hover(server, documents);
  new Completions(server, documents, [
    new PropertyCompletionsProvider(),
    new ValueCompletionsProvider()
  ]);
  new FoldingRanges(server, documents);
  new DocumentSymbols(server, documents);
  new SelectionRanges(server, documents);
  new DocumentLinks(server, documents, workspace);
  new DocumentColors(server, documents);

  return server;
};
