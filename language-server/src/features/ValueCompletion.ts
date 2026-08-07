import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver";

import type { CompletionItem, Position } from "vscode-languageserver";
import type { JsonDocument } from "../models/JsonDocument.ts";
import type { CompletionsProvider } from "./Completion.ts";

export class ValueCompletion implements CompletionsProvider {
  async getCompletions(jsonDocument: JsonDocument, position: Position): Promise<CompletionItem[]> {
    const node = jsonDocument.findNodeAtPosition(position)!;

    if (node.type !== "property" || node.colonOffset === undefined) {
      return [];
    }

    const offset = jsonDocument.offsetAt(position);
    if (offset <= node.colonOffset!) {
      return [];
    }

    const propertyName = node.children![0].value as string;
    const objectNode = node.parent!;

    const valueInfo = await jsonDocument.getPropertyValueInfo(objectNode, propertyName);
    if (!valueInfo) {
      return [];
    }

    const range = {
      start: jsonDocument.positionAt(node.colonOffset! + 1),
      end: position
    };

    if (valueInfo.hasConst) {
      return [{
        label: JSON.stringify(valueInfo.const),
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: { range, newText: " " + JSON.stringify(valueInfo.const) }
      }];
    }

    if (valueInfo.enum?.length) {
      return valueInfo.enum.map((value) => ({
        label: JSON.stringify(value),
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: { range, newText: " " + JSON.stringify(value) }
      }));
    }

    const types = new Set(Array.isArray(valueInfo.type) ? valueInfo.type : valueInfo.type ? [valueInfo.type] : []);

    const completionItems: CompletionItem[] = [];
    for (const type of types) {
      if (type === "boolean") {
        completionItems.push(
          {
            label: "true",
            kind: CompletionItemKind.Value,
            insertTextFormat: InsertTextFormat.Snippet,
            textEdit: { range, newText: " true" }
          },
          {
            label: "false",
            kind: CompletionItemKind.Value,
            insertTextFormat: InsertTextFormat.Snippet,
            textEdit: { range, newText: " false" }
          }
        );
        continue;
      }

      if (type === "number" || type === "integer") {
        continue;
      }

      completionItems.push({
        label: valueLabel(type),
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: { range, newText: " " + valuePlaceholder(type, 1) }
      });
    }
    return completionItems;
  }
}

const valuePlaceholder = (type: string, tabIndex: number): string => {
  switch (type) {
    case "string": return `"$${tabIndex}"`;
    case "object": return "{$0}";
    case "array": return "[$0]";
    case "null": return "null";
    default: return `$${tabIndex}`;
  }
};

const valueLabel = (type: string): string => {
  switch (type) {
    case "string": return `""`;
    case "object": return "{}";
    case "array": return "[]";
    default: return type;
  }
};
