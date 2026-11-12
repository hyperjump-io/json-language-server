import { MarkupKind } from "vscode-languageserver";
import { JsonDocuments } from "../services/JsonDocuments.ts";
import { LspEvaluationPlugin } from "../evaluation/LspEvaluationPlugin.ts";
import { describeAnnotations, joinDocumentation } from "./annotation-documentation.ts";

import type { Server } from "../services/Server.ts";
import type { MarkupContent, ServerCapabilities } from "vscode-languageserver";
import type { JsonSchema } from "../services/JsonSchema.ts";
import type { Annotation } from "../evaluation/Annotation.ts";
import type { Json } from "@hyperjump/json-pointer";

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

        // A property key is described by the annotations that apply no matter
        // what its value is. A value is also described by the annotations that
        // apply because of what it is, after the more general ones.
        const plugin = LspEvaluationPlugin.from(result);
        const pointer = jsonDocument.getPointerForNode(node);
        const annotations = jsonDocument.isPropertyKey(node)
          ? plugin.getLocationAnnotations(pointer)
          : [...plugin.getLocationAnnotations(pointer), ...plugin.getValueAnnotations(pointer)];

        const documentation = annotations.flatMap((annotation) => [
          ...describeAnnotations([annotation]),
          ...describeValues(annotation)
        ]);
        if (documentation.length === 0) {
          return;
        }

        documentation.push({ kind: MarkupKind.Markdown, value: "---\n\n_hyperjump-json-language-server_" });

        return { contents: joinDocumentation(documentation)! };
      } catch {
      }
    });
  }
}

// The default and examples of an annotation as JSON code blocks
const describeValues = (annotation: Annotation): MarkupContent[] => {
  const documentation: MarkupContent[] = [];

  const defaultValue = annotation.default();
  if (defaultValue !== undefined) {
    documentation.push({ kind: MarkupKind.Markdown, value: `Default:\n\n${jsonCodeBlock(defaultValue)}` });
  }

  const examples = annotation.examples();
  if (examples.length > 0) {
    documentation.push({ kind: MarkupKind.Markdown, value: `Examples:\n\n${examples.map(jsonCodeBlock).join("\n\n")}` });
  }

  return documentation;
};

// The fence is longer than any run of backticks in the JSON so a string value
// can't close the code block early
const jsonCodeBlock = (value: Json) => {
  const json = JSON.stringify(value, null, 2);
  const longestBacktickRun = Math.max(0, ...(json.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));

  return `${fence}json\n${json}\n${fence}`;
};
