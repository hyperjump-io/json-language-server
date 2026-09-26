import { CompletionItemKind, InsertTextFormat } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { AnnotationsEvaluationPlugin } from "../AnnotationsEvaluationPlugin.ts";

import type { CompletionsProvider } from "./Completions.ts";
import type { CompletionItem, CompletionParams, Range } from "vscode-languageserver";

type DefaultSnippet = {
  label?: string;
  description?: string;
  markdownDescription?: string;
  body?: string | string[];
  bodyText?: string;
};

export class DefaultSnippetsCompletionsProvider implements CompletionsProvider {
  async getCompletions(jsonDocument: JsonDocument, params: CompletionParams) {
    const node = jsonDocument.findNodeAtPosition({ ...params.position, character: params.position.character - 1 })!;

    if (node.parent?.type === "property" && node.parent.children?.[0] === node) {
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

    const annotationsPlugin = await jsonDocument.getEvaluationPlugin<AnnotationsEvaluationPlugin>(AnnotationsEvaluationPlugin.id);

    const completions: CompletionItem[] = [];
    for (const annotation of annotationsPlugin?.getAnnotations(instanceLocation) ?? []) {
      const defaultSnippets = (annotation["https://microsoft.com/keyword/defaultSnippets"]
        ?? annotation["https://json-schema.org/keyword/unknown#defaultSnippets"]
        ?? []) as DefaultSnippet[];

      for (const snippet of defaultSnippets) {
        completions.push({
          label: snippet.label ?? "snippet",
          kind: CompletionItemKind.Snippet,
          detail: snippet.description,
          insertTextFormat: InsertTextFormat.Snippet,
          textEdit: {
            range,
            newText: normalizeSnippetBody(snippet)
          }
        });
      }
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
