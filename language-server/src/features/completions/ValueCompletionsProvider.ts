import { CompletionItemKind, CompletionItemTag, InsertTextFormat, MarkupKind } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { LspEvaluationPlugin } from "../../evaluation/LspEvaluationPlugin.ts";
import { findDeprecated } from "../../evaluation/Annotation.ts";

import type { CompletionContext, CompletionsProvider } from "./Completions.ts";
import type { CompletionItem } from "vscode-languageserver";
import type { JsonSchema } from "../../services/JsonSchema.ts";

export class ValueCompletionsProvider implements CompletionsProvider {
  private jsonSchema: JsonSchema;

  constructor(jsonSchema: JsonSchema) {
    this.jsonSchema = jsonSchema;
  }

  async getCompletions(jsonDocument: JsonDocument, context: CompletionContext) {
    if (jsonDocument.isPropertyKey(context.node)) {
      return [];
    }

    const cursorOffset = jsonDocument.offsetAt(context.position);
    const completions: CompletionItem[] = [];

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      if (!result) {
        return [];
      }

      const plugin = LspEvaluationPlugin.from(result);

      for (const completion of plugin.getCompletions(context.instanceLocation)) {
        const label = completion.kind === "value" ? completion.value : typeSnippets[completion.type].label;
        const snippet = completion.kind === "value" ? completion.value : typeSnippets[completion.type].snippet;

        const completionItem: CompletionItem = {
          label,
          kind: CompletionItemKind.Value,
          labelDetails: {
            description: "hyperjump-json-language-server"
          },
          insertTextFormat: InsertTextFormat.Snippet,
          textEdit: {
            range: context.range,
            newText: /^[:,]$/.test(jsonDocument.getText()[cursorOffset - 1]) ? ` ${snippet}` : snippet
          }
        };

        // A value is deprecated only because of what it is, not because its location is
        const deprecated = findDeprecated(completion.annotations);
        if (deprecated) {
          completionItem.tags = [CompletionItemTag.Deprecated];
          const message = deprecated.markdownDeprecationMessage();
          if (message) {
            completionItem.documentation = { kind: MarkupKind.Markdown, value: message };
          }
        }

        completions.push(completionItem);
      }
    } catch {
      // No completions on schema error
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
