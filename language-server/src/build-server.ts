import { Server } from "./services/Server.ts";
import { JsonDocuments } from "./services/JsonDocuments.ts";
import { JsonSchema } from "./services/JsonSchema.ts";
import { JsonSchemaRegistry } from "./services/JsonSchemaRegistry.ts";
import { Workspace } from "./services/Workspace.ts";
import { Diagnostics } from "./features/diagnostics/Diagnostics.ts";
import { SyntaxValidationDiagnosticsProvider } from "./features/diagnostics/SyntaxValidationDiagnosticsProvider.ts";
import { SchemaValidationDiagnosticsProvider } from "./features/diagnostics/SchemaValidationDiagnosticsProvider.ts";
import { SchemaRegistrationDiagnosticsProvider } from "./features/diagnostics/SchemaRegistrationDiagnosticsProvider.ts";
import { Formatting } from "./features/Formatting.ts";
import { Hover } from "./features/Hover.ts";
import { Completions } from "./features/completions/Completions.ts";
import { PropertyCompletionsProvider } from "./features/completions/PropertyCompletionsProvider.ts";
import { ValueCompletionsProvider } from "./features/completions/ValueCompletionsProvider.ts";
import { DefaultSnippetsCompletionsProvider } from "./features/completions/DefaultSnippetsCompletionsProvider.ts";
import { FoldingRanges } from "./features/FoldingRanges.ts";
import { DocumentSymbols } from "./features/DocumentSymbols.ts";
import { SelectionRanges } from "./features/SelectionRanges.ts";
import { DocumentLinks } from "./features/DocumentLinks.ts";
import { DocumentColors } from "./features/DocumentColors.ts";
import { LspEvaluationPlugin } from "./evaluation/LspEvaluationPlugin.ts";

import type { Connection } from "vscode-languageserver";

export type LanguageServerSettings = {
};

export const buildServer = (connection: Connection): Server => {
  const server = new Server(connection);
  const workspace = new Workspace(server);

  const jsonDocuments = new JsonDocuments(server);
  jsonDocuments.listen(server);

  const registry = new JsonSchemaRegistry(server, workspace);
  const jsonSchema = new JsonSchema(server, workspace, jsonDocuments, registry);
  jsonSchema.registerPlugin(LspEvaluationPlugin.id, (jsonDocument) => {
    return new LspEvaluationPlugin(jsonDocument.collectIncompleteLocations());
  });

  new Diagnostics(server, jsonDocuments, jsonSchema, [
    new SyntaxValidationDiagnosticsProvider(server),
    new SchemaRegistrationDiagnosticsProvider(registry, jsonSchema),
    new SchemaValidationDiagnosticsProvider(jsonSchema)
  ]);

  new Formatting(server, jsonDocuments);
  new Hover(server, jsonDocuments, jsonSchema);
  new Completions(server, jsonDocuments, jsonSchema, [
    new PropertyCompletionsProvider(jsonSchema),
    new ValueCompletionsProvider(jsonSchema),
    new DefaultSnippetsCompletionsProvider(jsonSchema)
  ]);
  new FoldingRanges(server, jsonDocuments);
  new DocumentSymbols(server, jsonDocuments);
  new SelectionRanges(server, jsonDocuments);
  new DocumentLinks(server, jsonDocuments, workspace, registry);
  new DocumentColors(server, jsonDocuments, jsonSchema);

  return server;
};
