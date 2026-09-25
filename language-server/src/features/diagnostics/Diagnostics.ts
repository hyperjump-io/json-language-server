import { Server } from "../../services/Server.ts";
import { JsonDocuments } from "../../services/JsonDocuments.ts";
import { SchemaStore } from "../../services/SchemaStore.ts";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { abbreviateUri } from "../../util/utils.ts";

import type { Diagnostic } from "vscode-languageserver";

export type DiagnosticsProvider = {
  getDiagnostics(jsonDocument: JsonDocument): Promise<Diagnostic[]>;
};

export class Diagnostics {
  private server: Server;
  private providers: DiagnosticsProvider[];
  private pendingSends: Map<string, AbortController> = new Map();

  constructor(server: Server, jsonDocuments: JsonDocuments, schemaStore: SchemaStore, providers: DiagnosticsProvider[]) {
    this.server = server;
    this.providers = providers;

    jsonDocuments.onDidChangeContent(async (change) => {
      await this.sendDiagnostics(change.document);
    });

    schemaStore.onDidChangeSchema(async () => {
      for (const jsonDocument of jsonDocuments.all()) {
        if (await schemaStore.isStale(jsonDocument)) {
          await this.sendDiagnostics(jsonDocument);
        }
      }
    });
  }

  private async sendDiagnostics(document: JsonDocument) {
    this.pendingSends.get(document.uri)?.abort();

    const controller = new AbortController();
    this.pendingSends.set(document.uri, controller);

    const diagnostics = [];
    for (const provider of this.providers) {
      diagnostics.push(...await provider.getDiagnostics(document));
    }

    if (!controller.signal.aborted) {
      this.pendingSends.delete(document.uri);
      await this.server.sendDiagnostics({
        uri: document.uri,
        diagnostics: diagnostics
      });
      this.server.console.log(`send diagnostics for ${abbreviateUri(document.uri)}`);
    }
  }
}
