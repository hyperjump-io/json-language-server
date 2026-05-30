import { TextDocuments, TextDocumentSyncKind } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as jsonc from "jsonc-parser";
import { Server } from "../services/server.ts";
import { getSyntaxDiagnostics } from "./SyntaxValidation.ts";

import type { ServerCapabilities } from "vscode-languageserver";
import { getSchemaDiagnostics, type MatchingSchemaCollector } from "./SchemaValidation.ts";

const documentMap = new Map<string, MatchingSchemaCollector>();

export class JsonValidation {
  constructor(server: Server, documents: TextDocuments<TextDocument>) {
    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        textDocumentSync: TextDocumentSyncKind.Incremental
      };

      return {
        capabilities: serverCapabilities
      };
    });

    // Single onDidChangeContent handler to ensure one combined sendDiagnostics call per change, preventing multiple diagnostic pushes per keystroke from separate features
    documents.onDidChangeContent(async (change) => {
      const textDocument = change.document;
      const text = textDocument.getText();
      const parseErrors: jsonc.ParseError[] = [];

      const tree = jsonc.parseTree(text, parseErrors);

      // for syntax errors
      const syntaxDiagnostics = getSyntaxDiagnostics(textDocument, parseErrors);

      // for schema validation errors
      const schemaNode = tree ? jsonc.findNodeAtLocation(tree, ["$schema"]) : undefined;
      const schemaUri = schemaNode?.value;
      const schemaDiagnostics = schemaUri && parseErrors.length === 0 && tree
        ? await getSchemaDiagnostics(textDocument, tree, schemaUri, documentMap)
        : [];

      void server.sendDiagnostics({
        uri: textDocument.uri,
        diagnostics: [...syntaxDiagnostics, ...schemaDiagnostics]
      });
    });
  }
}
