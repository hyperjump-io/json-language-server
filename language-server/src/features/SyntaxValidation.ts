import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";

export const getSyntaxDiagnostics = (textDocument: TextDocument, parseErrors: jsonc.ParseError[]): Diagnostic[] => {
  return parseErrors.map((error) => ({
    severity: DiagnosticSeverity.Error,
    range: {
      start: textDocument.positionAt(error.offset),
      end: textDocument.positionAt(error.offset + error.length)
    },
    message: jsonc.printParseErrorCode(error.error),
    source: "json-language-server"
  }));
};
