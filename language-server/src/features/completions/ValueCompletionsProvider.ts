import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { LspEvaluationPlugin } from "../../evaluation/LspEvaluationPlugin.ts";

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

    const startOffset = jsonDocument.offsetAt(context.range.start);
    const completions: CompletionItem[] = [];

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      if (!result) {
        return [];
      }

      const plugin = LspEvaluationPlugin.from(result);

      for (const completion of plugin.getCompletions(context.instanceLocation)) {
        const label = completion.kind === "value" ? completion.value : typeSnippets[completion.type].label;
        const snippet = completion.kind === "value" ? escapeSnippet(completion.value) : typeSnippets[completion.type].snippet;

        completions.push({
          label,
          kind: CompletionItemKind.Value,
          labelDetails: {
            description: "hyperjump-json-language-server"
          },
          insertTextFormat: InsertTextFormat.Snippet,
          textEdit: {
            range: context.range,
            newText: /^[:,]$/.test(jsonDocument.getText()[startOffset - 1]) ? ` ${snippet}` : snippet
          }
        });
      }
    } catch {
      // No completions on schema error
    }
    return completions;
  }
}

// Values are inserted literally, so characters with meaning in snippet syntax
// need to be escaped.
const escapeSnippet = (text: string) => text.replace(/[\\$}]/g, "\\$&");

const typeSnippets: Record<string, { label: string; snippet: string }> = {
  integer: { label: "integer", snippet: "$0" },
  number: { label: "number", snippet: "$0" },
  string: { label: `""`, snippet: `"$0"` },
  array: { label: "[]", snippet: "[$0]" },
  object: { label: "{}", snippet: "{$0}" }
};
