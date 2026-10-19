import { abbreviateUri } from "../../util/utils.ts";

import type { Diagnostic } from "vscode-languageserver";
import type { JsonDocuments } from "../../services/JsonDocuments.ts";
import type { JsonDocument } from "../../models/JsonDocument.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";
import type { Server } from "../../services/Server.ts";

export type DiagnosticsProvider = {
  getDiagnostics(jsonDocument: JsonDocument): Promise<Diagnostic[]>;
};

// Validating on every keystroke would evaluate the document against its schema
// more often than anyone can read the results, so diagnostics for an edit are
// sent once the document hasn't changed for this long. This is what VS Code's
// JSON language server does.
const DIAGNOSTICS_DELAY = 500;

export class Diagnostics {
  private server: Server;
  private jsonDocuments: JsonDocuments;
  private providers: DiagnosticsProvider[];
  private delay: number;
  private pendingSends: Map<string, AbortController> = new Map();
  // Opening a document creates a new instance, so a document that hasn't been
  // seen yet was just opened and is validated without waiting
  private seenDocuments: WeakSet<JsonDocument> = new WeakSet();

  constructor(server: Server, jsonDocuments: JsonDocuments, jsonSchema: JsonSchema, providers: DiagnosticsProvider[], delay = DIAGNOSTICS_DELAY) {
    this.server = server;
    this.jsonDocuments = jsonDocuments;
    this.providers = providers;
    this.delay = delay;

    jsonDocuments.onDidChangeContent((change) => {
      this.scheduleDiagnostics(change.document);
    });

    jsonDocuments.onDidClose(async ({ document }) => {
      this.cancelPendingSend(document.uri);

      await this.server.sendDiagnostics({
        uri: document.uri,
        diagnostics: []
      });
      this.server.console.log(`clear diagnostics for ${abbreviateUri(document.uri)}`);
    });

    jsonSchema.onDidChangeDocumentSchema((change) => {
      this.scheduleDiagnostics(change.document);
    });
  }

  // Replaces any send that's waiting or in progress. Aborting the send cancels
  // it whether it's still waiting or already validating.
  private scheduleDiagnostics(document: JsonDocument) {
    this.cancelPendingSend(document.uri);

    const controller = new AbortController();
    this.pendingSends.set(document.uri, controller);

    const delay = this.seenDocuments.has(document) ? this.delay : 0;
    this.seenDocuments.add(document);

    const timeout = setTimeout(() => this.sendDiagnostics(document, controller), delay);
    controller.signal.addEventListener("abort", () => clearTimeout(timeout));
  }

  private async sendDiagnostics(document: JsonDocument, controller: AbortController) {
    // The document might have been closed (and possibly reopened as a new instance) since this was triggered
    if (this.jsonDocuments.get(document.uri) !== document) {
      return;
    }

    try {
      const diagnostics = [];
      for (const provider of this.providers) {
        diagnostics.push(...await provider.getDiagnostics(document));
      }

      if (!controller.signal.aborted && this.jsonDocuments.get(document.uri) === document) {
        await this.server.sendDiagnostics({
          uri: document.uri,
          diagnostics: diagnostics
        });
        this.server.console.log(`send diagnostics for ${abbreviateUri(document.uri)}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.server.console.error(`Failed to get diagnostics for ${abbreviateUri(document.uri)}: ${message}`);
    } finally {
      if (this.pendingSends.get(document.uri) === controller) {
        this.pendingSends.delete(document.uri);
      }
    }
  }

  private cancelPendingSend(uri: string) {
    this.pendingSends.get(uri)?.abort();
    this.pendingSends.delete(uri);
  }
}
