import { CompletionItemKind } from "vscode-languageserver";

import type { JsonDocument } from "../models/JsonDocument.ts";
import type { CompletionsProvider } from "./Completion.ts";
import type { CompletionItem, Position } from "vscode-languageserver";

export class PropertyCompletion implements CompletionsProvider {
  async getCompletions(jsonDocument: JsonDocument, position: Position) {
    const keyNode = jsonDocument.findNodeAtPosition(position)!;
    const propertyNode = keyNode.parent;

    if (propertyNode?.type !== "property" || propertyNode.children![0] !== keyNode) {
      return [];
    }

    const objectNode = propertyNode.parent!;

    const propertyNames = await jsonDocument.getDeclaredProperties(objectNode);
    for (const node of objectNode.children!) {
      if (node === propertyNode) {
        continue;
      }

      propertyNames.delete(node.children![0].value);
    }

    const completionItems: CompletionItem[] = [];
    for (const propertyName of propertyNames) {
      completionItems.push({
        label: propertyName,
        kind: CompletionItemKind.Property,
        filterText: JSON.stringify(propertyName),
        textEdit: {
          range: {
            start: jsonDocument.positionAt(keyNode.offset),
            end: jsonDocument.positionAt(keyNode.offset + keyNode.length)
          },
          newText: `"${propertyName}": `
        },
        command: { title: "Suggest", command: "editor.action.triggerSuggest" }
      });
    }
    return completionItems;
  }
}
