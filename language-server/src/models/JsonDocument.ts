import { TextDocumentContentChangeEvent } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";
import * as JsonPointer from "@hyperjump/json-pointer";
import { resolveIri } from "@hyperjump/uri";
import { parse } from "../parser/parse.ts";

import type { Position, Range } from "vscode-languageserver-textdocument";
import type { SyntaxError } from "../parser/parse.ts";

export class JsonDocument implements TextDocument {
  private textDocument: TextDocument;
  private documentSchemaUri: string | undefined;
  private ast: jsonc.Node | undefined;
  private parseErrors: SyntaxError[] = [];

  constructor(textDocument: TextDocument) {
    this.textDocument = textDocument;

    this.parse();
  }

  private parse() {
    this.parseErrors = [];

    const parseResult = parse(this.textDocument.getText(), { allowComments: this.languageId === "jsonc" });
    this.ast = parseResult.root;
    this.parseErrors = parseResult.errors;

    this.documentSchemaUri = undefined;
    const schemaNode = this.findNodeAtPointer("/$schema");
    if (schemaNode) {
      try {
        this.documentSchemaUri = resolveIri(schemaNode.value, this.uri);
      } catch {
        this.documentSchemaUri = schemaNode.value as string;
      }
    }
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

  getSchemaUri() {
    return this.documentSchemaUri;
  }

  update(changes: TextDocumentContentChangeEvent[], version: number) {
    TextDocument.update(this.textDocument, changes, version);
    this.parse();
  }

  getParseErrors() {
    return this.parseErrors;
  }

  // Property name locations are prefixed with "*" and find the property's key
  // rather than its value
  findNodeAtPointer(pointer: string): jsonc.Node | undefined {
    if (pointer.startsWith("*")) {
      const node = this.findNodeAtPointer(pointer.slice(1));
      return node?.parent?.type === "property" ? node.parent.children![0] : undefined;
    }

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

  isPropertyKey(node: jsonc.Node) {
    return node.parent?.type === "property" && node.parent.children?.[0] === node;
  }

  findNodeAtPosition(position: Position) {
    if (!this.ast) {
      return;
    }

    const offset = this.offsetAt(position);
    return jsonc.findNodeAtOffset(this.ast, offset);
  }

  // The pointer is built along the way because getPointerForNode is slow for
  // every node of a large document
  walkNodes(node: jsonc.Node, fn: (node: jsonc.Node, pointer: string) => void, pointer = this.getPointerForNode(node)) {
    fn(node, pointer);

    if (node.type === "array") {
      node.children!.forEach((childNode, index) => {
        this.walkNodes(childNode, fn, JsonPointer.append(String(index), pointer));
      });
    } else if (node.type === "object") {
      for (const propertyNode of node.children!) {
        const valueNode = propertyNode.children?.[1];
        if (valueNode) {
          this.walkNodes(valueNode, fn, JsonPointer.append(propertyNode.children![0].value, pointer));
        }
      }
    }
  }

  getNodeValue(node: jsonc.Node) {
    return jsonc.getNodeValue(node);
  }

  collectIncompleteLocations() {
    const incompleteLocations: Set<string> = new Set();
    if (!this.ast) {
      return incompleteLocations;
    }

    this.walkNodes(this.ast, (node, pointer) => {
      if (node.type === "object") {
        for (const propertyNode of node.children!) {
          if (propertyNode.children!.length === 1) {
            incompleteLocations.add(JsonPointer.append(propertyNode.children![0].value, pointer));
          }
        }
      } else if (node.type === "array") {
        incompleteLocations.add(JsonPointer.append(`${node.children!.length}`, pointer));
      }
    });
    return incompleteLocations;
  }
}
