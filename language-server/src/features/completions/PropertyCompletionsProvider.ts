import { CompletionItemKind, CompletionItemTag, MarkupKind } from "vscode-languageserver";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { LspEvaluationPlugin } from "../../evaluation/LspEvaluationPlugin.ts";
import { findDeprecated } from "../../evaluation/Annotation.ts";

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

        const completionItem: CompletionItem = {
          label: propertyName,
          kind: CompletionItemKind.Property,
          labelDetails: {
            description: "hyperjump-json-language-server"
          },
          filterText: JSON.stringify(propertyName),
          textEdit: {
            range: context.range,
            newText: `"${propertyName}": `
          },
          command: { title: "Suggest", command: "editor.action.triggerSuggest" }
        };

        // A property is deprecated only if it's deprecated no matter what its value is
        const propertyLocation = JsonPointer.append(propertyName, instanceLocation);
        const deprecated = findDeprecated(plugin.getLocationAnnotations(propertyLocation));
        if (deprecated) {
          completionItem.tags = [CompletionItemTag.Deprecated];
          const message = deprecated.markdownDeprecationMessage();
          if (message) {
            completionItem.documentation = { kind: MarkupKind.Markdown, value: message };
          }
        }

        completionItems.push(completionItem);
      }
    } catch {
      // No completions on schema error
    }

    return completionItems;
  }
}
