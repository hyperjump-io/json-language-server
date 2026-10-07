import { MarkupKind } from "vscode-languageserver";
import { JsonDocuments } from "../services/JsonDocuments.ts";
import { LspEvaluationPlugin } from "../evaluation/LspEvaluationPlugin.ts";

import type { Server } from "../services/Server.ts";
import type { ServerCapabilities } from "vscode-languageserver";
import type { JsonSchema } from "../services/JsonSchema.ts";

export class Hover {
  constructor(server: Server, jsonDocuments: JsonDocuments, jsonSchema: JsonSchema) {
    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        hoverProvider: true
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onHover(async (params) => {
      const jsonDocument = jsonDocuments.get(params.textDocument.uri)!;

      try {
        const node = jsonDocument.findNodeAtPosition(params.position)!;
        const result = await jsonSchema.validate(jsonDocument);
        if (!result) {
          return;
        }

        const plugin = LspEvaluationPlugin.from(result);
        const annotations = plugin.getAnnotations(jsonDocument.getPointerForNode(node));

        const lines: string[] = [];
        for (const annotation of annotations) {
          const title = annotation.title();
          if (title) {
            lines.push(`**${title}**`);
          }
          const description = annotation.description();
          if (description) {
            lines.push(description);
          }
        }

        if (lines.length === 0) {
          return;
        }

        lines.push("---\n\n_hyperjump-json-language-server_");

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: lines.join("\n\n")
          }
        };
      } catch {
      }
    });
  }
}
