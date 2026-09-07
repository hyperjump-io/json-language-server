import { CompletionItemKind } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import * as Pact from "@hyperjump/pact";

import type { CompletionsProvider } from "./Completions.ts";
import type { CompletionItem, CompletionParams } from "vscode-languageserver";
import type { CompletionsEvaluationPlugin } from "./CompletionsEvaluationPlugin.ts";

export class ValueCompletionsProvider implements CompletionsProvider {
  async getCompletions(jsonDocument: JsonDocument, params: CompletionParams) {
    let node = jsonDocument.findNodeAtPosition(params.position)!;

    while (node && node.type !== "property") {
      node = node.parent!;
    }

    if (!node || node.colonOffset === undefined) {
      return [];
    }

    const instanceLocation = jsonDocument.getPointerForNode(node);

    const plugin = await jsonDocument.getEvaluationPlugin("completions") as CompletionsEvaluationPlugin;

    const range = node.children![1]
      ? jsonDocument.rangeAt(node.children![1].offset, node.children![1].offset + node.children![1].length)
      : { start: params.position, end: jsonDocument.positionAt(node.colonOffset + 1) };

    return Pact.pipe(
      plugin.getCompletions(instanceLocation),
      Pact.map((completion): CompletionItem => {
        return {
          label: completion.value,
          kind: CompletionItemKind.Value,
          labelDetails: {
            description: "hyperjump-json-language-server"
          },
          textEdit: {
            range: range,
            newText: node.children![1] ? completion.value : ` ${completion.value}`
          }
        };
      }),
      Pact.collectArray
    );
  }
}
