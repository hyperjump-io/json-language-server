import { JsonDocument } from "../../models/JsonDocument.ts";

import type { CompletionsProvider } from "./Completions.ts";
import type { CompletionItem, CompletionParams } from "vscode-languageserver";
import type { CompletionsEvaluationPlugin } from "./CompletionsEvaluationPlugin.ts";

export class ValueCompletionsProvider implements CompletionsProvider {
  async getCompletions(jsonDocument: JsonDocument, params: CompletionParams): Promise<CompletionItem[]> {
    const node = jsonDocument.findNodeAtPosition(params.position)!;

    if (node.type !== "property" || node.colonOffset === undefined) {
      return [];
    }

    const instanceLocation = jsonDocument.getPointerForNode(node);

    const plugin = await jsonDocument.getEvaluationPlugin("completions") as CompletionsEvaluationPlugin;

    return plugin.getCompletions(instanceLocation).map((completion): CompletionItem => {
      return {
        label: completion
      };
    });
  }
}
