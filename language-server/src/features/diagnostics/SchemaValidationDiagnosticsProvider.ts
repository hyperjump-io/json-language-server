import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { ErrorMessageEvaluationPlugin } from "./ErrorMessageEvaluationPlugin.ts";

import type { ErrorObject } from "@hyperjump/json-schema-errors";
import type { DiagnosticsProvider } from "./Diagnostics.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";

export class SchemaValidationDiagnosticsProvider implements DiagnosticsProvider {
  private jsonSchema: JsonSchema;

  constructor(jsonSchema: JsonSchema) {
    this.jsonSchema = jsonSchema;

    jsonSchema.registerPlugin(ErrorMessageEvaluationPlugin.id, () => new ErrorMessageEvaluationPlugin());
  }

  async getDiagnostics(jsonDocument: JsonDocument) {
    const schemaDiagnostics: Diagnostic[] = [];

    const schemaNode = jsonDocument.findNodeAtPointer("/$schema");
    if (schemaNode && schemaNode.type !== "string") {
      schemaDiagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: jsonDocument.rangeAt(schemaNode.offset, schemaNode.offset + schemaNode.length),
        message: "$schema must be a string",
        source: "hyperjump-json-language-server"
      });
    }

    try {
      const result = await this.jsonSchema.validate(jsonDocument);

      if (result?.valid === false) {
        const errorMessages = ErrorMessageEvaluationPlugin.from(result);

        const errors = result.errors;
        errors.forEach((error) => {
          const pointer = decodeURIComponent(error.instanceLocation.slice(1));
          const node = jsonDocument.findNodeAtPointer(pointer);

          if (node) {
            schemaDiagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: jsonDocument.rangeAt(node.offset, node.offset + node.length),
              message: formatError(error, errorMessages),
              source: "hyperjump-json-language-server"
            });
          }
        });
      }
    } catch (error: unknown) {
      // Only a $schema that selected the schema has its errors reported on it
      if (schemaNode && jsonDocument.getSchemaUri()) {
        schemaDiagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: jsonDocument.rangeAt(schemaNode.offset, schemaNode.offset + schemaNode.length),
          message: error instanceof Error ? error.message : String(error),
          source: "hyperjump-json-language-server"
        });
      }
    }
    return schemaDiagnostics;
  }
}

export const formatError = (error: ErrorObject, errorMessages?: ErrorMessageEvaluationPlugin): string => {
  return formatLines(error, error.instanceLocation, errorMessages).join("\n");
};

const formatLines = (error: ErrorObject, parentLocation: string, errorMessages?: ErrorMessageEvaluationPlugin): string[] => {
  const location = relativeLocation(parentLocation, error.instanceLocation);

  // A schema's message replaces the error's explanation along with its message
  const errorMessage = errorMessages?.getMessage(error);
  if (errorMessage !== undefined) {
    return [`${location ? `${location}: ` : ""}${errorMessage}`];
  }

  const alternatives = error.alternatives ?? [];

  const lines = [`${location ? `${location}: ` : ""}${error.message}${alternatives.length > 0 ? ":" : ""}`];

  if (alternatives.length === 1) {
    // A single alternative is a list of things that all apply
    for (const subError of alternatives[0]) {
      lines.push(...indent(formatLines(subError, error.instanceLocation, errorMessages), "  - "));
    }
  } else {
    // Multiple alternatives are options. Number them so it's clear where each
    // option starts and ends.
    alternatives.forEach((alternative, index) => {
      const marker = `  ${index + 1}. `;
      alternative.forEach((subError, subErrorIndex) => {
        const firstPrefix = subErrorIndex === 0 ? marker : " ".repeat(marker.length);
        lines.push(...indent(formatLines(subError, error.instanceLocation, errorMessages), firstPrefix));
      });
    });
  }

  return lines;
};

const indent = ([first, ...rest]: string[], firstPrefix: string): string[] => {
  const restPrefix = " ".repeat(firstPrefix.length);
  return [firstPrefix + first, ...rest.map((line) => restPrefix + line)];
};

// Nested errors are at or below their parent's location. Show where they are
// relative to the parent so the user knows which part of the value they're about.
const relativeLocation = (parentLocation: string, location: string): string => {
  const parentPointer = toPointer(parentLocation);
  const pointer = toPointer(location);

  if (pointer === parentPointer) {
    return "";
  } else if (pointer.startsWith(`${parentPointer}/`)) {
    return pointer.slice(parentPointer.length);
  } else {
    return pointer;
  }
};

// Property name locations are prefixed with "*". For display purposes, the
// property name is at the same location as the property.
const toPointer = (location: string) => decodeURIComponent(location.slice(1)).replace(/^\*/, "");
