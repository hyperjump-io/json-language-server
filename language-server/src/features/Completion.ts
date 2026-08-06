import type { CompletionItem, Position, ServerCapabilities } from "vscode-languageserver";
import type { Server } from "../services/Server.ts";
import type { JsonDocument } from "../models/JsonDocument.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";

export type CompletionsProvider = {
  getCompletions(jsonDocument: JsonDocument, position: Position): Promise<CompletionItem[]>;
};

export class Completion {
  constructor(server: Server, jsonDocuments: JsonDocuments, providers: CompletionsProvider[]) {
    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        completionProvider: {
          triggerCharacters: [":", "\""]
        }
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onCompletion(async ({ textDocument, position }) => {
      const jsonDocument = jsonDocuments.get(textDocument.uri)!;

      const completions: CompletionItem[] = [];
      for (const provider of providers) {
        completions.push(...await provider.getCompletions(jsonDocument, position));
      }

      return completions;
    });
  }
}
