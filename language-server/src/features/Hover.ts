import { MarkupKind } from "vscode-languageserver";
import { JsonDocuments } from "../services/JsonDocuments.ts";
import { AnnotationsEvaluationPlugin } from "./AnnotationsEvaluationPlugin.ts";

import type { Server } from "../services/Server.ts";
import type { ServerCapabilities } from "vscode-languageserver";
import type { JsonSchema } from "../services/JsonSchema.ts";

export class Hover {
  constructor(server: Server, jsonDocuments: JsonDocuments, jsonSchema: JsonSchema) {
    jsonSchema.registerPlugin(AnnotationsEvaluationPlugin.id, (jsonDocument) => {
      return new AnnotationsEvaluationPlugin(jsonDocument.collectIncompleteLocations());
    });

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

        const annotationsEvaluationPlugin = result.plugins.get(AnnotationsEvaluationPlugin.id) as AnnotationsEvaluationPlugin;
        const annotations = annotationsEvaluationPlugin.getAnnotations(jsonDocument.getPointerForNode(node));

        const lines: string[] = [];
        for (const annotation of annotations) {
          if (annotation["https://json-schema.org/keyword/title"]) {
            lines.push(`**${annotation["https://json-schema.org/keyword/title"] as string}**`);
          }
          const description = (annotation["https://microsoft.com/keyword/markdownDescription"]
            ?? annotation["https://json-schema.org/keyword/unknown#markdownDescription"]
            ?? annotation["https://json-schema.org/keyword/description"]) as string | undefined;
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
