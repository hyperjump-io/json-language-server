import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";

import type { CompletionsProvider } from "./Completions.ts";
import type { CompletionItem, CompletionParams, Range } from "vscode-languageserver";
import type { CompletionsEvaluationPlugin } from "./CompletionsEvaluationPlugin.ts";

export class ValueCompletionsProvider implements CompletionsProvider {
  async getCompletions(jsonDocument: JsonDocument, params: CompletionParams) {
    const node = jsonDocument.findNodeAtPosition({ ...params.position, character: params.position.character - 1 })!;

    if (node.parent?.type === "property" && node.parent.colonOffset === undefined) {
      return [];
    }

    if (node.type === "property" && node.colonOffset === undefined) {
      return [];
    }

    const cursorOffset = jsonDocument.offsetAt(params.position);

    let instanceLocation: string;
    let range: Range;

    switch (node.type) {
      case "property":
        instanceLocation = jsonDocument.getPointerForNode(node);
        range = { start: jsonDocument.positionAt(node.colonOffset! + 1), end: params.position };
        break;

      case "array":
        const index = Pact.pipe(
          node.children!,
          Pact.takeWhile((itemNode) => cursorOffset >= itemNode.offset),
          Pact.count
        );

        instanceLocation = JsonPointer.append(`${index}`, jsonDocument.getPointerForNode(node));
        range = { start: params.position, end: params.position };
        break;

      default:
        instanceLocation = jsonDocument.getPointerForNode(node);
        range = jsonDocument.rangeAt(node.offset, node.offset + node.length);
    }

    const plugin = await jsonDocument.getEvaluationPlugin("completions") as CompletionsEvaluationPlugin;

    const completions: CompletionItem[] = [];
    for (const completion of plugin.getCompletions(instanceLocation)) {
      const snippet = completion.value
        ? completion.value
        : typeSnippets[completion.type!].snippet;

      completions.push({
        label: completion.value ?? typeSnippets[completion.type!].label,
        kind: CompletionItemKind.Value,
        labelDetails: {
          description: "hyperjump-json-language-server"
        },
        insertTextFormat: InsertTextFormat.Snippet,
        textEdit: {
          range: range,
          newText: /^[:,]$/.test(jsonDocument.getText()[cursorOffset - 1]) ? ` ${snippet}` : snippet
        }
      });
    }
    return completions;
  }
}

const typeSnippets: Record<string, { label: string; snippet: string }> = {
  integer: { label: "integer", snippet: "$0" },
  number: { label: "number", snippet: "$0" },
  string: { label: `""`, snippet: `"$0"` },
  array: { label: "[]", snippet: "[$0]" },
  object: { label: "{}", snippet: "{$0}" }
};
