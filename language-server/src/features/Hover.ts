import { MarkupKind } from "vscode-languageserver";
import { JsonDocuments } from "../services/JsonDocuments.ts";
import { LspEvaluationPlugin } from "../evaluation/LspEvaluationPlugin.ts";
import { describeAnnotations, describeEnumValue, joinDocumentation } from "./annotation-documentation.ts";

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

        // A property key is described by the annotations that apply no matter
        // what its value is. A value is also described by the annotations that
        // apply because of what it is, after the more general ones.
        const plugin = LspEvaluationPlugin.from(result);
        const pointer = jsonDocument.getPointerForNode(node);
        const isPropertyKey = jsonDocument.isPropertyKey(node);
        const annotations = isPropertyKey
          ? plugin.getLocationAnnotations(pointer)
          : [...plugin.getLocationAnnotations(pointer), ...plugin.getValueAnnotations(pointer)];

        const documentation = describeAnnotations(annotations);

        // A value is also described by the enum descriptions it matches. The
        // node of a property, which the cursor is on between its key and
        // value, has no value. The canonical JSON of a large object or array
        // is slow to build, so it's only built if the value could be an enum
        // value.
        if (!isPropertyKey && node.type !== "property" && annotations.some((annotation) => annotation.hasEnum())) {
          documentation.push(...describeEnumValue(annotations, canonicalJson(jsonDocument.getNodeValue(node))));
        }

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

// The same form as the enum values a schema is compiled to: no whitespace and
// keys in sorted order. JSON.stringify can't be used with a replacer that sorts
// keys because it puts integer-like keys first.
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (typeof value === "object" && value !== null) {
    const properties = Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${properties.join(",")}}`;
  }

  return JSON.stringify(value);
};
