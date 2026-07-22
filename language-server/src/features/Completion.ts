import { CompletionItemKind, ServerCapabilities } from "vscode-languageserver";
import { JsonDocuments } from "../services/JsonDocuments.ts";

import type { Server } from "../services/Server.ts";
import type { CompletionItem } from "vscode-languageserver";

export class Completion {
  constructor(server: Server, jsonDocuments: JsonDocuments) {
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

    server.onCompletion(async (params) => {
      const document = jsonDocuments.get(params.textDocument.uri)!;
      const keyNode = document.findNodeAtPosition(params.position);
      const propertyNode = keyNode?.parent;
      const objectNode = propertyNode?.parent;
      if (!objectNode) {
        return [];
      }

      const isAtPropertyKey = propertyNode?.type === "property" && propertyNode.children?.[0] === keyNode;
      if (!isAtPropertyKey) {
        return [];
      }

      const propertyNames = await document.getPropertyNames(objectNode);

      const existingKeys = new Set(
        (objectNode.children ?? [])
          .filter((property) => property !== propertyNode)
          .map((property) => property.children?.[0]?.value as string)
      );

      return [...propertyNames.difference(existingKeys)].map((propertyName): CompletionItem => ({
        label: propertyName,
        kind: CompletionItemKind.Property
      }));
    });
  }
}
