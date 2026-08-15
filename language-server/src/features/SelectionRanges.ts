import * as jsonc from "jsonc-parser";

import type { SelectionRange, ServerCapabilities } from "vscode-languageserver";
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
      const scanner = jsonc.createScanner(jsonDocument.getText(), true);

      return params.positions.map((position) => {
        const offset = jsonDocument.offsetAt(position);
        const node = jsonDocument.findNodeAtPosition(position);

        if (!node) {
          return { range: { start: position, end: position } };
        }

        return this.buildSelectionRange(node, jsonDocument, scanner, offset);
      });
    });
  }

  private buildSelectionRange(node: jsonc.Node, jsonDocument: JsonDocument, scanner: jsonc.JSONScanner, offset: number): SelectionRange {
    let selection = node.parent ? this.buildSelectionRange(node.parent, jsonDocument, scanner, offset) : undefined;

    if (node.type === "property" || (node.parent?.type === "array")) {
      scanner.setPosition(node.offset + node.length);
      if (scanner.scan() === jsonc.SyntaxKind.CommaToken) {
        const afterComma = scanner.getTokenOffset() + scanner.getTokenLength();
        selection = { range: jsonDocument.rangeAt(node.offset, afterComma), parent: selection };
      }
    }

    switch (node.type) {
      case "string":
      case "object":
      case "array": {
        selection = { range: jsonDocument.rangeAt(node.offset, node.offset + node.length), parent: selection };

        const innerStart = node.offset + 1;
        const innerEnd = node.offset + node.length - 1;
        if (innerStart < innerEnd && offset >= innerStart) {
          selection = { range: jsonDocument.rangeAt(innerStart, innerEnd), parent: selection };
        }
        break;
      }
      case "number":
      case "boolean":
      case "null":
      case "property":
        selection = { range: jsonDocument.rangeAt(node.offset, node.offset + node.length), parent: selection };
        break;
    }

    return selection;
  }
}
