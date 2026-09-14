import { CompletionItemKind, InsertTextFormat, Range } from "vscode-languageserver";
import * as Pact from "@hyperjump/pact";

import type { CompletionItem, Position } from "vscode-languageserver";
import type { JsonDocument } from "../models/JsonDocument.ts";
import type { CompletionsProvider } from "./Completion.ts";
import type { PropertyValueInfo } from "../services/CompletionEvaluationPlugin.ts";

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

    if (valueInfo.const !== undefined) {
      completionItems.push({
        label: valueInfo.const,
        kind: CompletionItemKind.Value,
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: { range, newText: " " + valueInfo.const }
      });
    } else if (valueInfo.enum) {
      completionItems.push(...Pact.map((value) => ({
        label: value,
        kind: CompletionItemKind.EnumMember,
        documentation: valueInfo.enumDescriptions?.get(value),
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: { range, newText: " " + value }
      }), valueInfo.enum));
    }

    if ((valueInfo.const === undefined && !valueInfo.enum) || valueInfo.permitsAnyValue) {
      completionItems.push(...this.genericTypeCompletions(valueInfo, range));
    }

    return completionItems;
  }

  private genericTypeCompletions(valueInfo: PropertyValueInfo, range: Range): CompletionItem[] {
    const types = valueInfo.type ?? new Set(["string", "number", "boolean", "null", "object", "array", "integer"]);
    const excluded = valueInfo.excluded ?? new Set<string>();

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
