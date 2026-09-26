import { DiagnosticSeverity } from "vscode-languageserver";

import type { DiagnosticsProvider } from "./Diagnostics.ts";
import { JsonDocument } from "../../models/JsonDocument.ts";

export class SyntaxValidationDiagnosticsProvider implements DiagnosticsProvider {
  async getDiagnostics(jsonDocument: JsonDocument) {
    return jsonDocument.getParseErrors().map((error) => ({
      severity: DiagnosticSeverity.Error,
      range: jsonDocument.rangeAt(error.offset, error.offset + error.length),
      message: error.code,
      source: "hyperjump-json-language-server"
    }));
  }
}
