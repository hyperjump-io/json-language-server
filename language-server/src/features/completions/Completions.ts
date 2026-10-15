import { CompletionItemTag, MarkupKind } from "vscode-languageserver";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { JsonDocuments } from "../../services/JsonDocuments.ts";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { describeAnnotations } from "../../util/utils.ts";

import type { CompletionItem, MarkupContent, Position, ServerCapabilities, Range } from "vscode-languageserver";
import type { Node } from "jsonc-parser";
import type { Annotation } from "../../evaluation/Annotation.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";
import type { Server } from "../../services/Server.ts";

export type CompletionsProvider = {
  getCompletions(jsonDocument: JsonDocument, context: CompletionContext): Promise<CompletionItem[]>;
};

export type CompletionContext = {
  node: Node;
  instanceLocation: string;
  range: Range;
  position: Position;
};

export const getDocumentation = (annotations: Annotation[]): MarkupContent | undefined => {
  const lines = describeAnnotations(annotations);
  if (lines.length === 0) {
    return;
  }

  return { kind: MarkupKind.Markdown, value: lines.join("\n\n") };
};

export class Completions {
  private jsonDocuments: JsonDocuments;
  private providers: CompletionsProvider[];

  constructor(server: Server, jsonDocuments: JsonDocuments, jsonSchema: JsonSchema, providers: CompletionsProvider[]) {
    this.jsonDocuments = jsonDocuments;
    this.providers = providers;

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        completionProvider: {
          triggerCharacters: [":", "\"", "\n", " "]
        }
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onCompletion(async (params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri);
      if (!jsonDocument) {
        return [];
      }

      if (params.context?.triggerCharacter === " ") {
        const cursorOffset = jsonDocument.offsetAt(params.position);
        const node = jsonDocument.findNodeAtPosition(params.position);
        if (node?.type === "string" || !/[:,]/.test(jsonDocument.getText()[cursorOffset - 2])) {
          return [];
        }
      }

      const context = getCompletionContext(jsonDocument, params.position);
      if (!context) {
        return [];
      }

      const completionItems: CompletionItem[] = [];
      for (const provider of this.providers) {
        completionItems.push(...await provider.getCompletions(jsonDocument, context));
      }

      return completionItems;
    });
  }
}

const getCompletionContext = (jsonDocument: JsonDocument, position: Position): CompletionContext | undefined => {
  const node = jsonDocument.findNodeAtPosition({ ...position, character: position.character - 1 });
  if (!node) {
    return;
  }

  const cursorOffset = jsonDocument.offsetAt(position);

  let instanceLocation: string;
  let range: Range;

  switch (node.type) {
    case "property":
      if (node.colonOffset === undefined) {
        return;
      }

      // Replace any partially typed value, but leave whitespace after the colon alone
      let startOffset = node.colonOffset + 1;
      while (startOffset < cursorOffset && /\s/.test(jsonDocument.getText()[startOffset])) {
        startOffset++;
      }

      instanceLocation = jsonDocument.getPointerForNode(node);
      range = { start: jsonDocument.positionAt(startOffset), end: position };
      break;

    case "array":
      const index = Pact.pipe(
        node.children!,
        Pact.takeWhile((itemNode) => cursorOffset >= itemNode.offset),
        Pact.count
      );

      instanceLocation = JsonPointer.append(`${index}`, jsonDocument.getPointerForNode(node));
      range = { start: position, end: position };
      break;

    default:
      instanceLocation = jsonDocument.getPointerForNode(node);
      range = jsonDocument.rangeAt(node.offset, node.offset + node.length);
  }

  return { node, instanceLocation, range, position };
};

// Marks a completion as deprecated if any of the annotations deprecate it,
// with their messages as its documentation
export const tagDeprecated = (completionItem: CompletionItem, annotations: Annotation[]) => {
  const deprecated = annotations.filter((annotation) => annotation.deprecated());
  if (deprecated.length > 0) {
    completionItem.tags = [CompletionItemTag.Deprecated];
    completionItem.documentation = deprecationDocumentation(deprecated);
  }
};

// The deprecation messages of every annotation that deprecates a completion.
// Markdown if any of them is markdown, otherwise plain text. Plain text
// messages are escaped when they're combined with markdown ones.
const deprecationDocumentation = (deprecated: Annotation[]): MarkupContent | undefined => {
  const isMarkdown = deprecated.some((annotation) => annotation.markdownDeprecationMessage() !== undefined);
  const messages = Pact.pipe(
    deprecated,
    Pact.map((annotation) => {
      const plainMessage = annotation.deprecationMessage();
      return annotation.markdownDeprecationMessage() ?? (isMarkdown && plainMessage ? escapeMarkdown(plainMessage) : plainMessage);
    }),
    Pact.filter((message) => message !== undefined),
    Pact.collectArray
  );

  if (messages.length === 0) {
    return;
  }

  return { kind: isMarkdown ? MarkupKind.Markdown : MarkupKind.PlainText, value: messages.join("\n\n") };
};

// Any ASCII punctuation can be escaped, so escaping all of it is always safe
const escapeMarkdown = (text: string) => text.replace(/[!-/:-@[-`{-~]/g, "\\$&");
