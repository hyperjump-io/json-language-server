import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { JsonDocument } from "../models/JsonDocument.ts";

import type { ErrorObject } from "@hyperjump/json-schema-errors";
import type { DiagnosticsProvider } from "./Diagnostics.ts";

export class SchemaValidation implements DiagnosticsProvider {
  async getDiagnostics(jsonDocument: JsonDocument) {
    const schemaDiagnostics: Diagnostic[] = [];

    try {
      const result = await jsonDocument.getSchemaErrors();

      if (result?.valid === false) {
        const errors = result.errors;
        errors.forEach((error) => {
          const pointer = decodeURIComponent(error.instanceLocation.slice(1));
          const node = jsonDocument.findNodeAtPointer(pointer);

          if (node) {
            schemaDiagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: {
                start: jsonDocument.positionAt(node.offset),
                end: jsonDocument.positionAt(node.offset + node.length)
              },
              message: formatError(error),
              source: "hyperjump-json-language-server"
            });
          }
        });
      }
    } catch (error: unknown) {
      const schemaNode = jsonDocument.findNodeAtPointer("/$schema");
      if (schemaNode) {
        schemaDiagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: {
            start: jsonDocument.positionAt(schemaNode.offset),
            end: jsonDocument.positionAt(schemaNode.offset + schemaNode.length)
          },
          message: error instanceof Error ? error.message : String(error),
          source: "hyperjump-json-language-server"
        });
      }
    }
    return schemaDiagnostics;
  }
}

const formatError = (error: ErrorObject, depth = 0): string => {
  let message = error.message;
  if (error.alternatives && error.alternatives.length > 0) {
    const indent = "  ".repeat(depth + 1);
    const lines = error.alternatives.flatMap((alt) => alt.map((subErr) => `${indent}- ${formatError(subErr, depth + 1)}`));
    message += `:\n${lines.join("\n")}`;
  }
  return message;
};
