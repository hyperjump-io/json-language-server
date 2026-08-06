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

    const isDeclared = await jsonDocument.hasDeclaredProperty(objectNode, propertyName);
    if (!isDeclared) {
      return [];
    }

    const range = {
      start: jsonDocument.positionAt(node.colonOffset! + 1),
      end: position
    };

    const annotations = await jsonDocument.getAnnotations(node.children![1]);
    const types = annotations.reduce((types, annotation) => {
      const currentTypes = annotation["https://json-schema.org/keyword/type"];
      const currentTypesArray = Array.isArray(currentTypes) ? currentTypes : [currentTypes];
      const currentTypesSet = new Set(currentTypesArray);
      return types.intersection(currentTypesSet);
    }, new Set(["object", "array", "string", "number", "integer", "boolean", "null"]));

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
