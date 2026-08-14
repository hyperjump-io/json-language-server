import * as jsonc from "jsonc-parser";

import type { SelectionRange, ServerCapabilities } from "vscode-languageserver";
import type { Position, Range } from "vscode-languageserver-textdocument";
import type { Server } from "../services/Server.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";
import type { JsonDocument } from "../models/JsonDocument.ts";

export class SelectionRanges {
  private jsonDocuments: JsonDocuments;

  constructor(server: Server, jsonDocuments: JsonDocuments) {
    this.jsonDocuments = jsonDocuments;

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        selectionRangeProvider: true
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onSelectionRanges((params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri)!;
      return params.positions.map((position) => getSelectionRange(jsonDocument, position));
    });
  }
}

const getSelectionRange = (jsonDocument: JsonDocument, position: Position): SelectionRange => {
  const offset = jsonDocument.offsetAt(position);
  let node = jsonDocument.findNodeAtPosition(position);

  const scanner = jsonc.createScanner(jsonDocument.getText(), true);
  const ranges: Range[] = [];

  while (node) {
    switch (node.type) {
      case "string":
      case "object":
      case "array": {
        const innerStart = node.offset + 1;
        const innerEnd = node.offset + node.length - 1;
        if (innerStart < innerEnd && offset >= innerStart && offset <= innerEnd) {
          ranges.push(jsonDocument.rangeAt(innerStart, innerEnd));
        }
        ranges.push(jsonDocument.rangeAt(node.offset, node.offset + node.length));
        break;
      }
      case "number":
      case "boolean":
      case "null":
      case "property":
        ranges.push(jsonDocument.rangeAt(node.offset, node.offset + node.length));
        break;
    }

    if (node.type === "property" || (node.parent && node.parent.type === "array")) {
      const afterComma = offsetAfterMatchingToken(scanner, node.offset + node.length, jsonc.SyntaxKind.CommaToken);
      if (afterComma !== -1) {
        ranges.push(jsonDocument.rangeAt(node.offset, afterComma));
      }
    }

    node = node.parent;
  }

  let current: SelectionRange | undefined;
  for (let i = ranges.length - 1; i >= 0; i--) {
    current = { range: ranges[i], parent: current };
  }

  return current ?? { range: { start: position, end: position } };
};

const offsetAfterMatchingToken = (scanner: jsonc.JSONScanner, fromOffset: number, expectedToken: jsonc.SyntaxKind): number => {
  scanner.setPosition(fromOffset);
  if (scanner.scan() === expectedToken) {
    return scanner.getTokenOffset() + scanner.getTokenLength();
  }
  return -1;
};
