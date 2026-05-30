import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";
import { validate } from "@hyperjump/json-schema/draft-2020-12";
import { BASIC } from "@hyperjump/json-schema/experimental";
import * as Instance from "@hyperjump/json-schema/instance/experimental";
import { jsonSchemaErrors } from "@hyperjump/json-schema-errors";

import type { Node } from "@hyperjump/json-schema/experimental";
import type { ErrorObject } from "@hyperjump/json-schema-errors";

export class MatchingSchemaCollector {
  matches: Map<string, any[]>;

  constructor() {
    this.matches = new Map();
  }

  afterKeyword(node: Node<unknown>, instance: any, keywordContext: any, valid: any, schemaContext: any, keyword: any) {
    const [keywordId, schemaUri, keywordValue] = node;
    const instanceLocation = Instance.uri(instance);

    const skipKeyword = new Set([
      "https://json-schema.org/keyword/allOf",
      "https://json-schema.org/keyword/anyOf",
      "https://json-schema.org/keyword/oneOf"
    ]);

    if (!this.matches.has(instanceLocation)) {
      this.matches.set(instanceLocation, []);
    }
    if (!skipKeyword.has(keywordId)) {
      this.matches.get(instanceLocation)?.push({
        keywordId,
        schemaUri,
        keywordValue,
        value: instance.value,
        valid,
        keywordContext,
        schemaContext,
        keyword
      });
    }
  }
}

export const getSchemaDiagnostics = async (textDocument: TextDocument, tree: jsonc.Node, schemaUri: string, documentMap: Map<string, MatchingSchemaCollector>): Promise<Diagnostic[]> => {
  const text = textDocument.getText();
  const schemaDiagnostics: Diagnostic[] = [];

  if (schemaUri) {
    let instance = JSON.parse(text);
    const collector = new MatchingSchemaCollector();
    const result = await validate(schemaUri, instance, {
      outputFormat: BASIC,
      plugins: [collector]
    });

    documentMap.set(textDocument.uri, collector);

    if (!result.valid) {
      const errors = await jsonSchemaErrors(result, schemaUri, instance);
      errors.forEach((error) => {
        const path = error.instanceLocation === "#" ? [] : error.instanceLocation.slice(2).split("/");
        const node = tree ? jsonc.findNodeAtLocation(tree, path) : undefined;

        if (node) {
          schemaDiagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
              start: textDocument.positionAt(node.offset),
              end: textDocument.positionAt(node.offset + node.length)
            },
            message: formatError(error),
            source: "json-language-server"
          });
        }
      });
    }
  }
  return schemaDiagnostics;
};

const formatError = (error: ErrorObject, depth = 0): string => {
  let msg = error.message;
  if (error.alternatives && error.alternatives.length > 0) {
    const indent = "  ".repeat(depth + 1);
    const lines = error.alternatives.flatMap((alt) => alt.map((subErr) => `${indent}- ${formatError(subErr, depth + 1)}`));
    msg += `:\n${lines.join("\n")}`;
  }
  return msg;
};
