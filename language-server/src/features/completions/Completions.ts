import * as JsonPointer from "@hyperjump/json-pointer";
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
      jsonDocument.registerEvaluationPlugin(completionsEvaluationPluginId, () => {
        const incompleteLocations: Set<string> = new Set();
        jsonDocument.walkNodes(jsonDocument.findNodeAtPointer("")!, (node) => {
          if (node.type === "object") {
            for (const propertyNode of node.children!) {
              if (propertyNode.children!.length === 1) {
                incompleteLocations.add(jsonDocument.getPointerForNode(propertyNode));
              }
            }
          } else if (node.type === "array") {
            const pointer = JsonPointer.append(`${node.children!.length}`, jsonDocument.getPointerForNode(node));
            incompleteLocations.add(pointer);
          }
        });
        return new CompletionsEvaluationPlugin(incompleteLocations);
      });
    });

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        completionProvider: {
          triggerCharacters: [":", "\"", "\n", " "]
        }
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onCompletion(async (params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri);
      if (!jsonDocument) {
        return [];
      }

      if (params.context?.triggerCharacter === " ") {
        const cursorOffset = jsonDocument.offsetAt(params.position);
        const node = jsonDocument.findNodeAtPosition(params.position)!;
        if (node.type === "string" || !/[:,]/.test(jsonDocument.getText()[cursorOffset - 2])) {
          return [];
        }
      }

      const completionItems: CompletionItem[] = [];
      for (const provider of this.providers) {
        completionItems.push(...await provider.getCompletions(jsonDocument, params));
      }

      return completionItems;
    });
  }
}
