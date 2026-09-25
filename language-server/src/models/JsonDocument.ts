import { TextDocumentContentChangeEvent } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";
import * as JsonPointer from "@hyperjump/json-pointer";

import type { Position, Range } from "vscode-languageserver-textdocument";

export class JsonDocument implements TextDocument {
  private textDocument: TextDocument;
  private ast: jsonc.Node | undefined;
  private parseErrors: jsonc.ParseError[] = [];

  constructor(textDocument: TextDocument) {
    this.textDocument = textDocument;

    this.parse();
  }

  private parse() {
    this.parseErrors = [];
    this.ast = jsonc.parseTree(this.textDocument.getText(), this.parseErrors);
  }

  get uri() {
    return this.textDocument.uri;
  }

  get languageId() {
    return this.textDocument.languageId;
  }

  get version() {
    return this.textDocument.version;
  }

  get lineCount() {
    return this.textDocument.lineCount;
  }

  getText(range?: Range) {
    return this.textDocument.getText(range);
  }

  positionAt(offset: number) {
    return this.textDocument.positionAt(offset);
  }

  offsetAt(position: Position) {
    return this.textDocument.offsetAt(position);
  }

  getLineRange(line: number) {
    return this.textDocument.getLineRange(line);
  }

  getEOLCharacters(line: number) {
    return this.textDocument.getEOLCharacters(line);
  }

  rangeAt(startOffset: number, endOffset: number) {
    return {
      start: this.positionAt(startOffset),
      end: this.positionAt(endOffset)
    };
  }

  update(changes: TextDocumentContentChangeEvent[], version: number) {
    TextDocument.update(this.textDocument, changes, version);
    this.parse();
  }

  getParseErrors() {
    return this.parseErrors;
  }

  findNodeAtPointer(pointer: string) {
    let node = this.ast;

    for (let segment of JsonPointer.pointerSegments(pointer)) {
      if (!node) {
        return;
      }

      const key = node.type === "array" ? parseInt(segment) : segment;
      node = jsonc.findNodeAtLocation(node, [key]);
    }

    return node;
  }

  public getPointerForNode(node: jsonc.Node): string {
    const parent = node?.parent;
    if (!parent) {
      return JsonPointer.nil;
    }

    if (node.type === "property") {
      return JsonPointer.append(node.children![0].value, this.getPointerForNode(node.parent!));
    }

    if (parent.type === "property") {
      return JsonPointer.append(parent.children![0].value, this.getPointerForNode(parent.parent!));
    }

    if (parent.type === "array") {
      return JsonPointer.append(String(parent.children!.indexOf(node)), this.getPointerForNode(parent));
    }

    return this.getPointerForNode(parent);
  }

  findNodeAtPosition(position: Position) {
    if (!this.ast) {
      return;
    }

    const offset = this.offsetAt(position);
    return jsonc.findNodeAtOffset(this.ast, offset);
  }

  walkNodes(node: jsonc.Node, fn: (node: jsonc.Node) => void) {
    fn(node);

    if (node.type === "array") {
      for (const childNode of node.children!) {
        this.walkNodes(childNode, fn);
      }
    } else if (node.type === "object") {
      for (const propertyNode of node.children!) {
        const valueNode = propertyNode.children?.[1];
        if (valueNode) {
          this.walkNodes(valueNode, fn);
        }
      }
    }
  }
}
