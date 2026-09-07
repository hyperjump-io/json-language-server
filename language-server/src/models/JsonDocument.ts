import { TextDocumentContentChangeEvent } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";
import * as JsonPointer from "@hyperjump/json-pointer";
import { resolveIri } from "@hyperjump/uri";
import { SchemaStore } from "../services/SchemaStore.ts";
import { Server } from "../services/Server.ts";
import { abbreviateUri } from "../util/utils.ts";

import type { Position, Range } from "vscode-languageserver-textdocument";
import type { EvaluationPlugin } from "@hyperjump/json-schema/experimental";
import type { ValidationResult } from "@hyperjump/json-schema-errors";

type SchemaEvaluation = {
  result: ValidationResult | undefined;
  plugins: Map<string, EvaluationPlugin>;
};

export class JsonDocument implements TextDocument {
  private textDocument: TextDocument;
  private schemaStore: SchemaStore;
  private server: Server;
  private ast: jsonc.Node | undefined;
  private parseErrors: jsonc.ParseError[] = [];
  private schemaEvaluation: Promise<SchemaEvaluation | undefined> = Promise.resolve(undefined);
  private schemaUri: Promise<string | undefined> = Promise.resolve(undefined);
  private evaluationPluginFactories: Map<string, () => EvaluationPlugin> = new Map();

  constructor(textDocument: TextDocument, schemaStore: SchemaStore, server: Server) {
    this.textDocument = textDocument;
    this.schemaStore = schemaStore;
    this.server = server;

    this.validate();
  }

  registerEvaluationPlugin(id: string, factory: () => EvaluationPlugin) {
    this.evaluationPluginFactories.set(id, factory);
  }

  private validate() {
    this.server.console.log(`validate ${abbreviateUri(this.uri)} JSON syntax`);

    this.parseErrors = [];
    this.schemaEvaluation = Promise.resolve(undefined);
    this.schemaUri = Promise.resolve(undefined);

    this.ast = jsonc.parseTree(this.textDocument.getText(), this.parseErrors);

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
    this.schemaEvaluation = this.schemaUri.then(async (schemaUri) => {
      const plugins = new Map<string, EvaluationPlugin>();
      for (const [id, factory] of this.evaluationPluginFactories) {
        plugins.set(id, factory());
      }

      if (!schemaUri) {
        return { result: undefined, plugins };
      }

      const instance = jsonc.parse(this.getText());
      const result = await this.schemaStore.validate(schemaUri, instance, this.uri, [...plugins.values()]);
      return { result, plugins };
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
    this.validate();
  }

  getParseErrors() {
    return this.parseErrors;
  }

  async getSchemaErrors() {
    const schemaEvaluation = await this.schemaEvaluation;
    return schemaEvaluation?.result;
  }

  async getEvaluationPlugin<PluginType extends EvaluationPlugin>(id: string) {
    const schemaEvaluation = await this.schemaEvaluation;
    return schemaEvaluation?.plugins.get(id) as PluginType | undefined;
  }

  getSchemaUri() {
    return this.schemaUri;
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
