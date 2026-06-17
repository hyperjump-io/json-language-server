import { Server } from "../services/server.ts";
import { JsonDocuments } from "../services/JsonDocuments.ts";
import { JsonDocument } from "../models/JsonDocument.ts";

import type { Diagnostic } from "vscode-languageserver";

export type DiagnosticsProvider = {
  getDiagnostics(jsonDocument: JsonDocument): Promise<Diagnostic[]>;
};

export class Diagnostics {
  private providers: DiagnosticsProvider[];

  constructor(server: Server, documents: JsonDocuments, providers: DiagnosticsProvider[]) {
    this.providers = providers;

    documents.onDidChangeContent(async (change) => {
      const diagnostics = [];
      for (const provider of this.providers) {
        diagnostics.push(...await provider.getDiagnostics(change.document));
      }

      await server.sendDiagnostics({
        uri: change.document.uri,
        diagnostics: diagnostics
      });
    });
  }
}
