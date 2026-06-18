import { Server } from "../services/server.ts";
import { JsonDocuments } from "../services/JsonDocuments.ts";
import { JsonDocument } from "../models/JsonDocument.ts";

import type { Diagnostic } from "vscode-languageserver";

export type DiagnosticsProvider = {
  getDiagnostics(jsonDocument: JsonDocument): Promise<Diagnostic[]>;
};

export class Diagnostics {
  private server: Server;
  private providers: DiagnosticsProvider[];

  constructor(server: Server, documents: JsonDocuments, providers: DiagnosticsProvider[]) {
    this.server = server;
    this.providers = providers;

    documents.onDidChangeContent(async (change) => {
      await this.sendDiagnostics(change.document);
    });
  }

  async sendDiagnostics(document: JsonDocument) {
    const diagnostics = [];
    for (const provider of this.providers) {
      diagnostics.push(...await provider.getDiagnostics(document));
    }

    await this.server.sendDiagnostics({
      uri: document.uri,
      diagnostics: diagnostics
    });
  }
}
