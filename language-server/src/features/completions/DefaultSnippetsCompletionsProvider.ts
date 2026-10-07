import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { LspEvaluationPlugin } from "../LspEvaluationPlugin.ts";

import type { CompletionContext, CompletionsProvider } from "./Completions.ts";
import type { CompletionItem } from "vscode-languageserver";
import type { JsonSchema } from "../../services/JsonSchema.ts";
import type { DefaultSnippet } from "../../vocabularies/vscode.ts";

export class DefaultSnippetsCompletionsProvider implements CompletionsProvider {
  private jsonSchema: JsonSchema;

  constructor(jsonSchema: JsonSchema) {
    this.jsonSchema = jsonSchema;
  }

  async getCompletions(jsonDocument: JsonDocument, context: CompletionContext) {
    if (jsonDocument.isPropertyKey(context.node)) {
      return [];
    }
    const completions: CompletionItem[] = [];

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      if (!result) {
        return [];
      }

      const plugin = LspEvaluationPlugin.from(result);

      for (const annotation of plugin.getAnnotations(context.instanceLocation)) {
        for (const snippet of annotation.defaultSnippets()) {
          completions.push({
            label: snippet.label ?? "snippet",
            kind: CompletionItemKind.Snippet,
            detail: snippet.description,
            insertTextFormat: InsertTextFormat.Snippet,
            textEdit: {
              range: context.range,
              newText: normalizeSnippetBody(snippet)
            }
          });
        }
      }
    } catch {
      // No completions on schema error
    }
    return completions;
  }
}

function normalizeSnippetBody(snippet: DefaultSnippet): string {
  if (typeof snippet.bodyText === "string") {
    return snippet.bodyText;
  }

  if (snippet.body !== undefined) {
    if (typeof snippet.body === "string") {
      return snippet.body;
    }

    if (Array.isArray(snippet.body)) {
      return snippet.body
        .map((v) => typeof v === "string" ? v : JSON.stringify(v))
        .join("\n");
    }

    return JSON.stringify(snippet.body);
  }

  return "";
}
