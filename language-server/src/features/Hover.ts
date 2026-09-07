import { MarkupKind } from "vscode-languageserver";
import { JsonDocuments } from "../services/JsonDocuments.ts";
import { AnnotationsEvaluationPlugin } from "./AnnotationsEvaluationPlugin.ts";

import type { Server } from "../services/Server.ts";
import type { ServerCapabilities } from "vscode-languageserver";

export class Hover {
  constructor(server: Server, jsonDocuments: JsonDocuments) {
    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        hoverProvider: true
      };

      return {
        capabilities: serverCapabilities
      };
    });

    jsonDocuments.onDidCreate((jsonDocument) => {
      jsonDocument.registerEvaluationPlugin(AnnotationsEvaluationPlugin.id, () => new AnnotationsEvaluationPlugin());
    });

    server.onHover(async (params) => {
      const jsonDocument = jsonDocuments.get(params.textDocument.uri)!;

      try {
        const node = jsonDocument.findNodeAtPosition(params.position)!;
        const annotationsEvaluationPlugin = await jsonDocument.getEvaluationPlugin<AnnotationsEvaluationPlugin>(AnnotationsEvaluationPlugin.id);
        const annotations = annotationsEvaluationPlugin!.getAnnotations(jsonDocument.getPointerForNode(node));

        const lines: string[] = [];
        for (const annotation of annotations) {
          if (annotation["https://json-schema.org/keyword/title"]) {
            lines.push(`**${annotation["https://json-schema.org/keyword/title"] as string}**`);
          }
          if (annotation["https://json-schema.org/keyword/description"]) {
            lines.push(`${annotation["https://json-schema.org/keyword/description"] as string}`);
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
