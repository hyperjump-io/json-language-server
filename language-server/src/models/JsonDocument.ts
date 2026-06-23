import { TextDocumentContentChangeEvent } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";
import { pointerSegments } from "@hyperjump/json-pointer";
import { resolveIri } from "@hyperjump/uri";
import { SchemaStore } from "../services/SchemaStore.ts";

import type { Position, Range } from "vscode-languageserver-textdocument";
import type { ValidationResult } from "@hyperjump/json-schema-errors";

export class JsonDocument implements TextDocument {
  private textDocument: TextDocument;
  private schemaStore: SchemaStore;
  private ast: jsonc.Node | undefined;
  private parseErrors: jsonc.ParseError[] = [];
  private schemaErrors: Promise<ValidationResult> | undefined;
  private schemaUri: string | undefined;

  constructor(textDocument: TextDocument, schemaStore: SchemaStore) {
    this.textDocument = textDocument;
    this.schemaStore = schemaStore;

    this.validate();
  }

  private validate() {
    this.parseErrors = [];
    this.ast = jsonc.parseTree(this.textDocument.getText(), this.parseErrors);

    if (this.parseErrors.length > 0) {
      this.schemaErrors = undefined;
      return;
    }

    const rawSchemaUri = this.findNodeAtPointer("/$schema")?.value as string | undefined;
    if (rawSchemaUri !== undefined) {
      try {
        this.schemaUri = resolveIri(rawSchemaUri, this.uri);
      } catch {
        this.schemaUri = rawSchemaUri;
      }
    } else {
      this.schemaUri = undefined;
      this.schemaErrors = undefined;
      return;
    }

    this.validateSchema();
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

  validateSchema() {
    this.schemaErrors = undefined;

    // validateSchema() is directly called from outside this class as well, so we need to check for parse errors here aswell
    if (this.parseErrors.length > 0 || this.schemaUri === undefined) {
      return;
    }

    const instance = JSON.parse(this.getText());
    this.schemaErrors = this.schemaStore.validate(this.schemaUri, instance);
  }

  getParseErrors() {
    return this.parseErrors;
  }

  getSchemaErrors() {
    return this.schemaErrors;
  }

  getSchemaUri() {
    return this.schemaUri;
  }

  dependsOn(changedUris: Set<string>): boolean {
    if (this.schemaUri === undefined) {
      return false;
    }

    const dependentSchemaUris = this.schemaStore.getDependentSchemaUris(this.schemaUri);

    if (dependentSchemaUris === undefined) {
      return true;
    }

    // added this loop to prevent revalidation of every open document in the workspace tht would be revalidated on every file change
    for (const uri of changedUris) {
      if (dependentSchemaUris.has(uri)) {
        return true;
      }
    }

    return false;
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
