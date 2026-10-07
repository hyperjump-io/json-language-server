import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { JsonDocuments } from "../../services/JsonDocuments.ts";
import { JsonDocument } from "../../models/JsonDocument.ts";

import type { CompletionItem, Position, ServerCapabilities, Range } from "vscode-languageserver";
import type { Node } from "jsonc-parser";
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

      instanceLocation = jsonDocument.getPointerForNode(node);
      range = { start: jsonDocument.positionAt(node.colonOffset + 1), end: position };
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
