import { CompletionItemKind } from "vscode-languageserver";
import * as Pact from "@hyperjump/pact";
import { LspEvaluationPlugin } from "../../evaluation/LspEvaluationPlugin.ts";

import type { CompletionItem } from "vscode-languageserver";
import type { CompletionContext, CompletionsProvider } from "./Completions.ts";
import type { JsonDocument } from "../../models/JsonDocument.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";

export class PropertyCompletionsProvider implements CompletionsProvider {
  private jsonSchema: JsonSchema;

  constructor(jsonSchema: JsonSchema) {
    this.jsonSchema = jsonSchema;
  }

  async getCompletions(jsonDocument: JsonDocument, context: CompletionContext) {
    if (!jsonDocument.isPropertyKey(context.node) || context.node.parent!.colonOffset !== undefined) {
      return [];
    }

    const objectNode = context.node.parent!.parent!;
    const existingPropertyNames = Pact.pipe(
      objectNode.children!,
      Pact.map((propertyNode) => propertyNode.children![0].value),
      Pact.collectSet
    );

    const instanceLocation = jsonDocument.getPointerForNode(objectNode);

    const completionItems: CompletionItem[] = [];

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      if (!result) {
        return [];
      }

      const plugin = LspEvaluationPlugin.from(result);

      for (const propertyName of plugin.getPropertyCompletions(instanceLocation)) {
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
            range: context.range,
            newText: `${JSON.stringify(propertyName)}: `
          },
          command: { title: "Suggest", command: "editor.action.triggerSuggest" }
        });
      }
    } catch {
      // No completions on schema error
    }

    return completionItems;
  }
}
