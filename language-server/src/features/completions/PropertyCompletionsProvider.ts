import { CompletionItemKind } from "vscode-languageserver";
import * as Pact from "@hyperjump/pact";

import type { CompletionItem, CompletionParams } from "vscode-languageserver";
import type { CompletionsProvider } from "./Completions.ts";
import type { CompletionsEvaluationPlugin } from "./CompletionsEvaluationPlugin.ts";
import type { JsonDocument } from "../../models/JsonDocument.ts";

export class PropertyCompletionsProvider implements CompletionsProvider {
  async getCompletions(jsonDocument: JsonDocument, params: CompletionParams) {
    const node = jsonDocument.findNodeAtPosition(params.position)!;

    if (node.parent?.type !== "property" || node.parent.children?.[0] !== node || node.parent.colonOffset !== undefined) {
      return [];
    }

    const objectNode = node.parent.parent!;
    const existingPropertyNames = Pact.pipe(
      objectNode.children!,
      Pact.map((propertyNode) => propertyNode.children![0].value),
      Pact.collectSet
    );

    const instanceLocation = jsonDocument.getPointerForNode(objectNode);
    const range = jsonDocument.rangeAt(node.offset, node.offset + node.length);

    const plugin = await jsonDocument.getEvaluationPlugin("completions") as CompletionsEvaluationPlugin;
    const propertyNames = plugin.getPropertyCompletions(instanceLocation);

    const completionItems: CompletionItem[] = [];
    for (const propertyName of propertyNames) {
      if (existingPropertyNames.has(propertyName)) {
        continue;
      }

      completionItems.push({
        label: propertyName,
        kind: CompletionItemKind.Property,
        labelDetails: {
          description: "hyperjump-json-language-server"
        },
        filterText: JSON.stringify(propertyName),
        textEdit: {
          range: range,
          newText: `"${propertyName}": `
        },
        command: { title: "Suggest", command: "editor.action.triggerSuggest" }
      });
    }
    return completionItems;
  }
}
