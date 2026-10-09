import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";
import { getSchema } from "@hyperjump/json-schema/experimental";
import * as Browser from "@hyperjump/browser";

import type { ErrorObject } from "@hyperjump/json-schema-errors";
import type { DiagnosticsProvider } from "./Diagnostics.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";

export class SchemaValidationDiagnosticsProvider implements DiagnosticsProvider {
  private jsonSchema: JsonSchema;

  constructor(jsonSchema: JsonSchema) {
    this.jsonSchema = jsonSchema;
  }

  async getDiagnostics(jsonDocument: JsonDocument) {
    const schemaDiagnostics: Diagnostic[] = [];

    try {
      const result = await this.jsonSchema.validate(jsonDocument);

      if (result?.valid === false) {
        const errors = result.errors;
        for (const error of errors) {
          const pointer = decodeURIComponent(error.instanceLocation.slice(1));
          const node = jsonDocument.findNodeAtPointer(pointer);

          if (node) {
            schemaDiagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: jsonDocument.rangeAt(node.offset, node.offset + node.length),
              message: await formatError(error),
              source: "hyperjump-json-language-server"
            });
          }
        }
      }
    } catch (error: unknown) {
      const schemaNode = jsonDocument.findNodeAtPointer("/$schema");
      if (schemaNode) {
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

export const formatError = async (error: ErrorObject): Promise<string> => {
  return (await formatLines(error, error.instanceLocation)).join("\n");
};

const formatLines = async (error: ErrorObject, parentLocation: string): Promise<string[]> => {
  const location = relativeLocation(parentLocation, error.instanceLocation);
  const alternatives = error.alternatives ?? [];
  const message = await resolveMessage(error);

  const lines = [`${location ? `${location}: ` : ""}${message}${alternatives.length > 0 ? ":" : ""}`];

  if (alternatives.length === 1) {
    // A single alternative is a list of things that all apply
    for (const subError of alternatives[0]) {
      lines.push(...indent(await formatLines(subError, error.instanceLocation), "  - "));
    }
  } else {
    // Multiple alternatives are options. Number them so it's clear where each
    // option starts and ends.
    for (let index = 0; index < alternatives.length; index++) {
      const marker = `  ${index + 1}. `;
      const alternative = alternatives[index];
      for (let subErrorIndex = 0; subErrorIndex < alternative.length; subErrorIndex++) {
        const firstPrefix = subErrorIndex === 0 ? marker : " ".repeat(marker.length);
        lines.push(...indent(await formatLines(alternative[subErrorIndex], error.instanceLocation), firstPrefix));
      }
    }
  }

  return lines;
};

async function getErrorMessageOverride(schemaLocation: string): Promise<string | undefined> {
  try {
    const lastSlash = schemaLocation.lastIndexOf("/");
    const parentLocation = schemaLocation.slice(0, lastSlash);
    const parentSchema = await getSchema(parentLocation);
    const value = Browser.value(parentSchema) as Record<string, unknown>;
    return typeof value?.errorMessage === "string" ? value.errorMessage : undefined;
  } catch {
    return undefined;
  }
}

async function resolveMessage(error: ErrorObject): Promise<string> {
  for (const schemaLocation of error.schemaLocations) {
    const override = await getErrorMessageOverride(schemaLocation);
    if (override) {
      return override;
    }
  }
  return error.message;
}

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
