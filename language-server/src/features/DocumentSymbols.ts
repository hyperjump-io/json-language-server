import { SymbolKind } from "vscode-languageserver";

import type { DocumentSymbol, ServerCapabilities } from "vscode-languageserver";
import type { Node } from "jsonc-parser";
import type { Server } from "../services/Server.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";
import type { JsonDocument } from "../models/JsonDocument.ts";

export class DocumentSymbols {
  private jsonDocuments: JsonDocuments;

  constructor(server: Server, jsonDocuments: JsonDocuments) {
    this.jsonDocuments = jsonDocuments;

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        documentSymbolProvider: true
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onDocumentSymbol((params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri)!;
      const ast = jsonDocument.findNodeAtPointer("");
      if (!ast) {
        return [];
      }

      return this.collectDocumentSymbols(jsonDocument, ast);
    });
  }

  private collectDocumentSymbols(jsonDocument: JsonDocument, node: Node): DocumentSymbol[] {
    const symbols: DocumentSymbol[] = [];

    if (node.type === "object") {
      for (const propertyNode of node.children!) {
        const keyNode = propertyNode.children![0];
        const valueNode = propertyNode.children![1];

        const keyRange = {
          start: jsonDocument.positionAt(keyNode.offset),
          end: jsonDocument.positionAt(keyNode.offset + keyNode.length)
        };
        const keySymbol: DocumentSymbol = {
          name: String(keyNode.value),
          kind: SymbolKind.Property,
          range: keyRange,
          selectionRange: keyRange
        };
        symbols.push(keySymbol);

        if (valueNode) {
          const valueRange = {
            start: jsonDocument.positionAt(valueNode.offset),
            end: jsonDocument.positionAt(valueNode.offset + valueNode.length)
          };
          const valueName = valueNode.value !== undefined ? String(valueNode.value) : String(keyNode.value);
          const kind = this.getSymbolKind(valueNode.type);
          const children = this.collectDocumentSymbols(jsonDocument, valueNode);

          const valueSymbol: DocumentSymbol = {
            name: valueName,
            kind,
            range: valueRange,
            selectionRange: valueRange
          };

          if (children.length > 0) {
            valueSymbol.children = children;
          }

          symbols.push(valueSymbol);
        }
      }
    } else if (node.type === "array") {
      node.children!.forEach((child, index) => {
        const name = String(index);
        const range = {
          start: jsonDocument.positionAt(child.offset),
          end: jsonDocument.positionAt(child.offset + child.length)
        };
        const selectionRange = range;

        const kind = this.getSymbolKind(child.type);
        const children = this.collectDocumentSymbols(jsonDocument, child);

        const symbol: DocumentSymbol = { name, kind, range, selectionRange };

        if (children.length > 0) {
          symbol.children = children;
        }

        symbols.push(symbol);
      });
    }

    return symbols;
  }

  private getSymbolKind(type?: string): SymbolKind {
    switch (type) {
      case "object":
        return SymbolKind.Object;
      case "array":
        return SymbolKind.Array;
      case "string":
        return SymbolKind.String;
      case "number":
        return SymbolKind.Number;
      case "boolean":
        return SymbolKind.Boolean;
      case "null":
        return SymbolKind.Null;
      case "property":
        return SymbolKind.Property;
      default:
        // Unreachable code, but typescript needs something to know the function doesn't return undefined
        throw Error("Unreachable");
    }
  }
}
