import { Server } from "../services/Server.ts";
import { JsonDocuments } from "../services/JsonDocuments.ts";
import { Workspace } from "../services/Workspace.ts";
import { JsonDocument } from "../models/JsonDocument.ts";
import { normalizeIri } from "@hyperjump/uri";
import { abbreviateUri } from "../util/utils.ts";

import type { Diagnostic } from "vscode-languageserver";

export type DiagnosticsProvider = {
  getDiagnostics(jsonDocument: JsonDocument): Promise<Diagnostic[]>;
};

export class Diagnostics {
  private server: Server;
  private jsonDocuments: JsonDocuments;
  private providers: DiagnosticsProvider[];

  constructor(server: Server, jsonDocuments: JsonDocuments, workspace: Workspace, providers: DiagnosticsProvider[]) {
    this.server = server;
    this.jsonDocuments = jsonDocuments;
    this.providers = providers;

    jsonDocuments.onDidChangeContent(async (change) => {
      await this.sendDiagnostics(change.document);
    });

    workspace.onDidChangeWatchedFiles(async (params) => {
      for (const change of params.changes) {
        const changedUri = normalizeIri(change.uri);
        await this.revalidateDependentDocuments(changedUri);
      }
    });
  }

  private async sendDiagnostics(document: JsonDocument) {
    const diagnostics = [];
    for (const provider of this.providers) {
      diagnostics.push(...await provider.getDiagnostics(document));
    }

    await this.server.sendDiagnostics({
      uri: document.uri,
      diagnostics: diagnostics
    });
    this.server.console.log(`send diagnostics for ${abbreviateUri(document.uri)}`);
  }

  private async revalidateDependentDocuments(schemaUri: string) {
    for (const jsonDocument of this.jsonDocuments.all()) {
      if (await jsonDocument.dependsOn(schemaUri)) {
        jsonDocument.validateSchema();
        await this.sendDiagnostics(jsonDocument);
      }
    }
  }
}
