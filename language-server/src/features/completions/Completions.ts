import { JsonDocuments } from "../../services/JsonDocuments.ts";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { CompletionsEvaluationPlugin } from "./CompletionsEvaluationPlugin.ts";

import type { Server } from "../../services/Server.ts";
import type { CompletionItem, CompletionParams, ServerCapabilities } from "vscode-languageserver";

const completionsEvaluationPluginId = "completions";

export type CompletionsProvider = {
  getCompletions(jsonDocument: JsonDocument, params: CompletionParams): Promise<CompletionItem[]>;
};

export class Completions {
  private jsonDocuments: JsonDocuments;
  private providers: CompletionsProvider[];

  constructor(server: Server, jsonDocuments: JsonDocuments, providers: CompletionsProvider[]) {
    this.jsonDocuments = jsonDocuments;
    this.providers = providers;

    jsonDocuments.onDidCreate((jsonDocument) => {
      jsonDocument.registerEvaluationPlugin(completionsEvaluationPluginId, () => new CompletionsEvaluationPlugin());
    });

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        completionProvider: {
          triggerCharacters: [":", "\"", "[", "{"]
        }
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onCompletion((params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri);
      if (!jsonDocument) {
        return [];
      }

      return this.getCompletions(jsonDocument, params);
    });
  }

  private async getCompletions(jsonDocument: JsonDocument, params: CompletionParams) {
    const completionItems: CompletionItem[] = [];
    for (const provider of this.providers) {
      completionItems.push(...await provider.getCompletions(jsonDocument, params));
    }

    return completionItems;
  }
}
