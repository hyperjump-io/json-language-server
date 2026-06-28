import { TextDocumentContentChangeEvent } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";
import { pointerSegments } from "@hyperjump/json-pointer";
import { resolveIri } from "@hyperjump/uri";
import { SchemaStore } from "../services/SchemaStore.ts";
import { Server } from "../services/Server.ts";
import { abbreviateUri } from "../util/utils.ts";

import type { Position, Range } from "vscode-languageserver-textdocument";
import type { ValidationResult } from "@hyperjump/json-schema-errors";

export class JsonDocument implements TextDocument {
  private textDocument: TextDocument;
  private schemaStore: SchemaStore;
  private server: Server;
  private ast: jsonc.Node | undefined;
  private parseErrors: jsonc.ParseError[] = [];
  private schemaErrors: Promise<ValidationResult | undefined> = Promise.resolve(undefined);
  private schemaUri: Promise<string | undefined> = Promise.resolve(undefined);

  constructor(textDocument: TextDocument, schemaStore: SchemaStore, server: Server) {
    this.textDocument = textDocument;
    this.schemaStore = schemaStore;
    this.server = server;

    this.validate();
  }

  private validate() {
    this.server.console.log(`validate ${abbreviateUri(this.uri)} JSON syntax`);

    this.parseErrors = [];
    this.schemaErrors = Promise.resolve(undefined);
    this.schemaUri = Promise.resolve(undefined);

    this.ast = jsonc.parseTree(this.textDocument.getText(), this.parseErrors);

    if (this.parseErrors.length > 0) {
      return;
    }

    const schemaNode = this.findNodeAtPointer("/$schema");
    if (schemaNode) {
      try {
        this.schemaUri = Promise.resolve(resolveIri(schemaNode.value, this.uri));
      } catch {
        this.schemaUri = Promise.resolve(schemaNode.value);
      }
    } else {
      this.schemaUri = this.schemaStore.getSchemaUri(this.uri);
    }

    this.validateSchema();
  }

  validateSchema() {
    this.schemaErrors = this.schemaUri.then((schemaUri) => {
      if (!schemaUri) {
        return;
      }

      const instance = JSON.parse(this.getText());
      return this.schemaStore.validate(schemaUri, instance, this.uri);
    });
  }

  async dependsOn(changedUri: string) {
    const schemaUri = await this.schemaUri;

    if (!schemaUri) {
      return false;
    }

    const dependentSchemaUris = await this.schemaStore.getDependentSchemaUris(schemaUri);

    return dependentSchemaUris === undefined || dependentSchemaUris.has(changedUri);
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

  update(changes: TextDocumentContentChangeEvent[], version: number) {
    TextDocument.update(this.textDocument, changes, version);
    this.validate();
  }

  getParseErrors() {
    return this.parseErrors;
  }

  getSchemaErrors() {
    return this.schemaErrors;
  }

  findNodeAtPointer(pointer: string) {
    let node = this.ast;

    for (let segment of pointerSegments(pointer)) {
      if (!node) {
        return;
      }

      const key = node.type === "array" ? parseInt(segment) : segment;
      node = jsonc.findNodeAtLocation(node, [key]);
    }

    return node;
  }
}
