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

    const completionItems: CompletionItem[] = [];

    if (valueInfo.hasConst) {
      completionItems.push({
        label: JSON.stringify(valueInfo.const),
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: { range, newText: " " + JSON.stringify(valueInfo.const) }
      });
    } else if (valueInfo.enum) {
      completionItems.push(...valueInfo.enum.map((value) => ({
        label: JSON.stringify(value),
        kind: CompletionItemKind.EnumMember,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: { range, newText: " " + JSON.stringify(value) }
      })));
    }

    if ((!valueInfo.hasConst && !valueInfo.enum) || valueInfo.permitsAnyValue) {
      completionItems.push(...this.genericTypeCompletions(valueInfo, range));
    }

    return completionItems;
  }

  private genericTypeCompletions(valueInfo: { type?: string | string[]; excluded?: unknown[] }, range: { start: Position; end: Position }): CompletionItem[] {
    const types = new Set(Array.isArray(valueInfo.type) ? valueInfo.type : valueInfo.type ? [valueInfo.type] : ["string", "number", "boolean", "null", "object", "array", "integer"]);
    const excluded = new Set((valueInfo.excluded ?? []).map((value) => JSON.stringify(value)));

    const completionItems: CompletionItem[] = [];
    for (const type of types) {
      if (type === "boolean") {
        if (!excluded.has("true")) {
          completionItems.push({
            label: "true",
            kind: CompletionItemKind.Value,
            insertTextFormat: InsertTextFormat.Snippet,
            textEdit: { range, newText: " true" }
          });
        }
        if (!excluded.has("false")) {
          completionItems.push({
            label: "false",
            kind: CompletionItemKind.Value,
            insertTextFormat: InsertTextFormat.Snippet,
            textEdit: { range, newText: " false" }
          });
        }
        continue;
      }

      if (type === "null" && excluded.has("null")) {
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
    case "number":
    case "integer": return "$0";
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
