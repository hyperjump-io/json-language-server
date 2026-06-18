import { TextDocumentContentChangeEvent } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";
import { pointerSegments } from "@hyperjump/json-pointer";
import { SchemaStore } from "../services/SchemaStore.ts";

import type { Position, Range } from "vscode-languageserver-textdocument";
import type { ValidationResult } from "@hyperjump/json-schema-errors";

export class JsonDocument implements TextDocument {
  private textDocument: TextDocument;
  private schemaStore: SchemaStore;
  private ast: jsonc.Node | undefined;
  private parseErrors: jsonc.ParseError[] = [];
  private schemaErrors: Promise<ValidationResult> | undefined;

  constructor(textDocument: TextDocument, schemaStore: SchemaStore) {
    this.textDocument = textDocument;
    this.schemaStore = schemaStore;

    this.validate();
  }

  private validate() {
    this.parseErrors = [];
    this.ast = jsonc.parseTree(this.textDocument.getText(), this.parseErrors);

    if (this.parseErrors.length > 0) {
      return;
    }

    const schemaNode = this.findNodeAtPointer("/$schema");
    const schemaUri = schemaNode?.value;

    if (schemaUri === undefined) {
      return;
    }

    let instance = JSON.parse(this.getText());
    this.schemaErrors = this.schemaStore.validate(schemaUri, instance);
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

  getText(range?: Range): string {
    return this.textDocument.getText(range);
  }

  positionAt(offset: number): Position {
    return this.textDocument.positionAt(offset);
  }

  offsetAt(position: Position): number {
    return this.textDocument.offsetAt(position);
  }

  update(changes: TextDocumentContentChangeEvent[], version: number): void {
    TextDocument.update(this.textDocument, changes, version);
    this.validate();
  }

  revalidate() {
    this.validate();
  }

  getParseErrors() {
    return this.parseErrors;
  }

  getSchemaErrors() {
    return this.schemaErrors;
  }

  getSchemaUri() {
    const schemaNode = this.findNodeAtPointer("/$schema");
    return schemaNode?.value as string | undefined;
  }

  findNodeAtPointer(pointer: string) {
    if (!this.ast) {
      return;
    }

    return findNodeByPointer(this.ast, pointer);
  }
}

const findNodeByPointer = (node: jsonc.Node, pointer: string) => {
  if (pointer === "") {
    return node;
  }

  for (let segment of pointerSegments(pointer)) {
    const key = node.type === "array" ? parseInt(segment) : segment;
    node = jsonc.findNodeAtLocation(node, [key]) ?? node;
  }

  return node;
};
