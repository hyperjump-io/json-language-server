import { abbreviateUri } from "../../util/utils.ts";

import type { Diagnostic } from "vscode-languageserver";
import type { JsonDocuments } from "../../services/JsonDocuments.ts";
import type { JsonDocument } from "../../models/JsonDocument.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";
import type { Server } from "../../services/Server.ts";

export type DiagnosticsProvider = {
  getDiagnostics(jsonDocument: JsonDocument): Promise<Diagnostic[]>;
};

export class Diagnostics {
  private server: Server;
  private providers: DiagnosticsProvider[];
  private pendingSends: Map<string, AbortController> = new Map();

  constructor(server: Server, jsonDocuments: JsonDocuments, jsonSchema: JsonSchema, providers: DiagnosticsProvider[]) {
    this.server = server;
    this.providers = providers;

    jsonDocuments.onDidChangeContent(async (change) => {
      await this.sendDiagnostics(change.document);
    });

    jsonSchema.onDidChangeDocumentSchema(async (change) => {
      await this.sendDiagnostics(change.document);
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
