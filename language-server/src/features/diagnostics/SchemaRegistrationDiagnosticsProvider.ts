import { DiagnosticSeverity } from "vscode-languageserver";
import { JsonDocument } from "../../models/JsonDocument.ts";

import type { Diagnostic } from "vscode-languageserver";
import type { DiagnosticsProvider } from "./Diagnostics.ts";
import type { JsonSchemaRegistry } from "../../services/JsonSchemaRegistry.ts";

export class SchemaRegistrationDiagnosticsProvider implements DiagnosticsProvider {
  private registry: JsonSchemaRegistry;

  constructor(registry: JsonSchemaRegistry) {
    this.registry = registry;
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
      for (const fileUri of this.registry.getDuplicates(schemaUri)) {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range: jsonDocument.rangeAt(schemaNode.offset, schemaNode.offset + schemaNode.length),
          message: `Ambiguous schema identifier. '${fileUri}' also uses the identifier '${schemaUri}'`,
          source: "hyperjump-json-language-server"
        });
      }
    }

    return diagnostics;
  }
}
