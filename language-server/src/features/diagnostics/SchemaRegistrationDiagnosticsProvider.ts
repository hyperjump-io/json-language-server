import { DiagnosticSeverity } from "vscode-languageserver";
import { toAbsoluteIri } from "@hyperjump/uri";
import { JsonDocument } from "../../models/JsonDocument.ts";

import type { Diagnostic } from "vscode-languageserver";
import type { DiagnosticsProvider } from "./Diagnostics.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";
import type { JsonSchemaRegistry } from "../../services/JsonSchemaRegistry.ts";

export class SchemaRegistrationDiagnosticsProvider implements DiagnosticsProvider {
  private registry: JsonSchemaRegistry;
  private jsonSchema: JsonSchema;

  constructor(registry: JsonSchemaRegistry, jsonSchema: JsonSchema) {
    this.registry = registry;
    this.jsonSchema = jsonSchema;
  }

  async getDiagnostics(jsonDocument: JsonDocument) {
    const diagnostics: Diagnostic[] = [];

    await this.registry.ready;

    const idNode = jsonDocument.findNodeAtPointer("/$id") ?? jsonDocument.findNodeAtPointer("/id");
    if (idNode) {
      const error = this.registry.getRegistrationError(jsonDocument.uri);
      if (error) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: jsonDocument.rangeAt(idNode.offset, idNode.offset + idNode.length),
          message: error,
          source: "hyperjump-json-language-server"
        });
      }

      const schemaUri = await this.registry.getSchemaUri(jsonDocument.uri);
      for (const fileUri of schemaUri ? this.registry.getDuplicates(schemaUri) : []) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: jsonDocument.rangeAt(idNode.offset, idNode.offset + idNode.length),
          message: `Duplicate schema identifier. '${fileUri}' also uses the identifier '${schemaUri}'`,
          source: "hyperjump-json-language-server"
        });
      }
    }

    const schemaUri = jsonDocument.getSchemaUri();
    const schemaNode = jsonDocument.findNodeAtPointer("/$schema");
    if (schemaUri && schemaNode) {
      const range = jsonDocument.rangeAt(schemaNode.offset, schemaNode.offset + schemaNode.length);

      for (const fileUri of this.registry.getDuplicates(schemaUri)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range,
          message: `Ambiguous schema identifier. '${fileUri}' also uses the identifier '${schemaUri}'`,
          source: "hyperjump-json-language-server"
        });
      }

      // Schemas referenced by the schema, directly or indirectly, are ambiguous too
      const absoluteSchemaUri = toAbsoluteIri(schemaUri);
      for (const dependencyUri of await this.jsonSchema.getDependencies(schemaUri)) {
        if (dependencyUri === absoluteSchemaUri) {
          continue;
        }

        for (const fileUri of this.registry.getDuplicates(dependencyUri)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range,
            message: `Ambiguous schema identifier in referenced schema. '${fileUri}' also uses the identifier '${dependencyUri}'`,
            source: "hyperjump-json-language-server"
          });
        }
      }
    }

    return diagnostics;
  }
}
