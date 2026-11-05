import { DiagnosticSeverity } from "vscode-languageserver";
import { Localization } from "../../localization/Localization.ts";
import { LspEvaluationPlugin } from "../../evaluation/LspEvaluationPlugin.ts";

import type { Diagnostic } from "vscode-languageserver";
import type { DiagnosticsProvider } from "./Diagnostics.ts";
import type { JsonDocument } from "../../models/JsonDocument.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";
import type { Server } from "../../services/Server.ts";

export class JsoncDiagnosticsProvider implements DiagnosticsProvider {
  private localization: Localization;
  private jsonSchema: JsonSchema;

  constructor(server: Server, jsonSchema: JsonSchema) {
    this.localization = Localization.forLocale();
    this.jsonSchema = jsonSchema;

    server.onInitialize(({ locale }) => {
      this.localization = Localization.forLocale(locale);
      return { capabilities: {} };
    });
  }

  async getDiagnostics(jsonDocument: JsonDocument) {
    const diagnostics: Diagnostic[] = [];

    let allowComments: boolean | undefined;
    let allowTrailingCommas: boolean | undefined;

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      if (result) {
        const annotations = LspEvaluationPlugin.from(result).getLocationAnnotations("");
        allowComments = annotations.some((a) => a.allowComments() === true);
        allowTrailingCommas = annotations.some((a) => a.allowTrailingCommas() === true);
      }
    } catch {
      // Schema errors are reported by SchemaValidationDiagnosticsProvider
    }

    const isJsonc = jsonDocument.languageId === "jsonc";

    if (allowComments !== true && !isJsonc) {
      for (const comment of jsonDocument.getComments()) {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: jsonDocument.rangeAt(comment.offset, comment.offset + comment.length),
          message: this.localization.getSyntaxErrorMessage({ code: "comment-not-allowed", ...comment }),
          source: "hyperjump-json-language-server"
        });
      }
    }

    if (allowTrailingCommas !== true) {
      for (const comma of jsonDocument.getTrailingCommas()) {
        diagnostics.push({
          severity: isJsonc ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
          range: jsonDocument.rangeAt(comma.offset, comma.offset + comma.length),
          message: this.localization.getSyntaxErrorMessage({ code: "trailing-comma", ...comma }),
          source: "hyperjump-json-language-server"
        });
      }
    }

    return diagnostics;
  }
}
