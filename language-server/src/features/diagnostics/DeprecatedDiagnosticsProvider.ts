import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver";
import { LspEvaluationPlugin } from "../../evaluation/LspEvaluationPlugin.ts";
import { findDeprecated } from "../../evaluation/Annotation.ts";

import type { Diagnostic } from "vscode-languageserver";
import type { Node } from "jsonc-parser";
import type { DiagnosticsProvider } from "./Diagnostics.ts";
import type { Annotation } from "../../evaluation/Annotation.ts";
import type { JsonDocument } from "../../models/JsonDocument.ts";
import type { JsonSchema } from "../../services/JsonSchema.ts";
import type { Server } from "../../services/Server.ts";

export class DeprecatedDiagnosticsProvider implements DiagnosticsProvider {
  private jsonSchema: JsonSchema;
  private hasDeprecatedTagCapability = false;

  constructor(server: Server, jsonSchema: JsonSchema) {
    this.jsonSchema = jsonSchema;

    server.onInitialize(({ capabilities }) => {
      // Without the deprecated tag, the client can't strike through deprecated
      // text, so the diagnostics would just be noise
      const tagSupport = capabilities.textDocument?.publishDiagnostics?.tagSupport;
      this.hasDeprecatedTagCapability = !!tagSupport?.valueSet.includes(DiagnosticTag.Deprecated);

      return { capabilities: {} };
    });
  }

  async getDiagnostics(jsonDocument: JsonDocument) {
    const diagnostics: Diagnostic[] = [];

    const ast = jsonDocument.findNodeAtPointer("");
    if (!this.hasDeprecatedTagCapability || !ast) {
      return diagnostics;
    }

    try {
      const result = await this.jsonSchema.validate(jsonDocument);
      if (!result) {
        return diagnostics;
      }

      const plugin = LspEvaluationPlugin.from(result);

      const report = (node: Node, annotation: Annotation) => {
        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          tags: [DiagnosticTag.Deprecated],
          range: jsonDocument.rangeAt(node.offset, node.offset + node.length),
          message: annotation.deprecationMessage() ?? "Deprecated",
          source: "hyperjump-json-language-server"
        });
      };

      // A deprecated property is marked on its key no matter what its value
      // is. A deprecated value is marked on the value.
      jsonDocument.walkNodes(ast, (node) => {
        // The root and array items don't have a key, so a deprecated location
        // is marked on the value
        if (node.parent?.type !== "property") {
          const pointer = jsonDocument.getPointerForNode(node);
          const deprecated = findDeprecated(plugin.getLocationAnnotations(pointer))
            ?? findDeprecated(plugin.getValueAnnotations(pointer));
          if (deprecated) {
            report(node, deprecated);
          }
        }

        // Properties are checked from the object because walkNodes doesn't
        // visit properties that don't have a value yet
        if (node.type === "object") {
          for (const propertyNode of node.children!) {
            const [keyNode, valueNode] = propertyNode.children!;
            const pointer = jsonDocument.getPointerForNode(propertyNode);

            const location = findDeprecated(plugin.getLocationAnnotations(pointer));
            if (location) {
              report(keyNode, location);
            }

            const value = valueNode && findDeprecated(plugin.getValueAnnotations(pointer));
            if (value) {
              report(valueNode, value);
            }
          }
        }
      });
    } catch {
      // Schema errors are reported by SchemaValidationDiagnosticsProvider
    }

    return diagnostics;
  }
}
