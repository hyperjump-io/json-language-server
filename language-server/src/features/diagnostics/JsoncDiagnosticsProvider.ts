import { DiagnosticSeverity } from "vscode-languageserver";
import { Localization } from "../../localization/Localization.ts";
import { LspEvaluationPlugin } from "../../evaluation/LspEvaluationPlugin.ts";
import { Annotation } from "../../evaluation/Annotation.ts";

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
    const diagnostics = [];

    let allowComments: boolean | undefined;
    let allowTrailingCommas: boolean | undefined;

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      if (result) {
        const plugin = LspEvaluationPlugin.from(result);
        const annotations = plugin.getAnnotations("");
        for (const annotation of annotations) {
          try {
            const annotated: any = new (Annotation as any)((annotation as any).keywords);
            if (allowComments === undefined && typeof annotated.allowComments === "function") {
              allowComments = annotated.allowComments();
            }
            if (allowTrailingCommas === undefined && typeof annotated.allowTrailingCommas === "function") {
              allowTrailingCommas = annotated.allowTrailingCommas();
            }
          } catch {}
        }
      }
    } catch {
      // ignore
    }

    if (allowComments !== true) {
      if (jsonDocument.languageId !== "jsonc") {
        for (const comment of jsonDocument.getComments()) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: jsonDocument.rangeAt(comment.offset, comment.offset + comment.length),
            message: this.localization.getSyntaxErrorMessage({ code: "comment-not-allowed", offset: comment.offset, length: comment.length }),
            source: "hyperjump-json-language-server"
          });
        }
      }
    }

    if (allowTrailingCommas !== true) {
      if (jsonDocument.languageId === "jsonc") {
        for (const comma of jsonDocument.getTrailingCommas()) {
          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: jsonDocument.rangeAt(comma.offset, comma.offset + comma.length),
            message: this.localization.getSyntaxErrorMessage({ code: "trailing-comma", offset: comma.offset, length: comma.length }),
            source: "hyperjump-json-language-server"
          });
        }
      } else {
        for (const comma of jsonDocument.getTrailingCommas()) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: jsonDocument.rangeAt(comma.offset, comma.offset + comma.length),
            message: this.localization.getSyntaxErrorMessage({ code: "trailing-comma", offset: comma.offset, length: comma.length }),
            source: "hyperjump-json-language-server"
          });
        }
      }
    }

    return diagnostics;
  }
}
