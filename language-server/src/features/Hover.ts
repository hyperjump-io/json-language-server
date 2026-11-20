import { MarkupKind } from "vscode-languageserver";
import { JsonDocuments } from "../services/JsonDocuments.ts";
import { LspEvaluationPlugin } from "../evaluation/LspEvaluationPlugin.ts";
import { describeAnnotations, joinDocumentation, supportsMarkdown } from "./annotation-documentation.ts";

import type { Server } from "../services/Server.ts";
import type { ServerCapabilities } from "vscode-languageserver";
import type { JsonSchema } from "../services/JsonSchema.ts";

export class Hover {
  private supportsMarkdown = false;

  constructor(server: Server, jsonDocuments: JsonDocuments, jsonSchema: JsonSchema) {
    server.onInitialize(({ capabilities }) => {
      this.supportsMarkdown = supportsMarkdown(capabilities.textDocument?.hover?.contentFormat);

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

        // A property key is described by the annotations that apply no matter
        // what its value is. A value is also described by the annotations that
        // apply because of what it is, after the more general ones.
        const plugin = LspEvaluationPlugin.from(result);
        const pointer = jsonDocument.getPointerForNode(node);
        const annotations = jsonDocument.isPropertyKey(node)
          ? plugin.getLocationAnnotations(pointer)
          : [...plugin.getLocationAnnotations(pointer), ...plugin.getValueAnnotations(pointer)];

        const documentation = describeAnnotations(annotations, this.supportsMarkdown);
        if (documentation.length === 0) {
          return;
        }

        documentation.push(this.supportsMarkdown
          ? { kind: MarkupKind.Markdown, value: "---\n\n_hyperjump-json-language-server_" }
          : { kind: MarkupKind.PlainText, value: "---\n\nhyperjump-json-language-server" });

        return { contents: joinDocumentation(documentation)! };
      } catch {
      }
    });
  }
}
