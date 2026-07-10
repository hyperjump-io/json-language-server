import { MarkupKind } from "vscode-languageserver";
import { JsonDocuments } from "../services/JsonDocuments.ts";

import type { Server } from "../services/Server.ts";
import type { ServerCapabilities } from "vscode-languageserver";

export class Hover {
  private jsonDocuments: JsonDocuments;

  constructor(server: Server, jsonDocuments: JsonDocuments) {
    this.jsonDocuments = jsonDocuments;

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        hoverProvider: true
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onHover(async (params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri)!;

      try {
        const annotations = await jsonDocument.getAnnotations(params.position);

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
