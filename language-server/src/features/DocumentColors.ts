import { LspEvaluationPlugin } from "./LspEvaluationPlugin.ts";

import type { Color, ColorInformation, ColorPresentation, ServerCapabilities } from "vscode-languageserver";
import type { Node } from "jsonc-parser";
import type { Annotation } from "../annotations/Annotation.ts";
import type { Server } from "../services/Server.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";
import type { JsonSchema } from "../services/JsonSchema.ts";

export class DocumentColors {
  private jsonDocuments: JsonDocuments;

  constructor(server: Server, jsonDocuments: JsonDocuments, jsonSchema: JsonSchema) {
    this.jsonDocuments = jsonDocuments;

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        colorProvider: true
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onDocumentColor(async (params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri);
      const ast = jsonDocument?.findNodeAtPointer("");
      if (!jsonDocument || !ast) {
        return [];
      }

      try {
        const result = await jsonSchema.validate(jsonDocument);
        if (!result) {
          return [];
        }

        const plugin = LspEvaluationPlugin.from(result);

        const stringNodes: Node[] = [];
        jsonDocument.walkNodes(ast, (node) => {
          if (node.type === "string") {
            stringNodes.push(node);
          }
        });

        const colors: ColorInformation[] = [];
        for (const node of stringNodes) {
          const color = colorFromHex(node.value as string);
          if (!color) {
            continue;
          }

          const annotations = plugin.getAnnotations(jsonDocument.getPointerForNode(node));
          if (annotations.some(isColorHex)) {
            colors.push({ color, range: jsonDocument.rangeAt(node.offset, node.offset + node.length) });
          }
        }

        return colors;
      } catch {
        return [];
      }
    });

    server.onColorPresentation((params): ColorPresentation[] => {
      const label = hexFromColor(params.color);
      return [{ label, textEdit: { range: params.range, newText: JSON.stringify(label) } }];
    });
  }
}

const isColorHex = (annotation: Annotation): boolean => annotation.formats().includes("color-hex");

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const colorFromHex = (text: string): Color | undefined => {
  if (typeof text !== "string" || !HEX_COLOR.test(text)) {
    return undefined;
  }

  const digits = text.slice(1);
  const isShorthand = digits.length < 6;
  const width = isShorthand ? 1 : 2;
  const channel = (index: number): number => {
    const digit = digits.slice(index * width, index * width + width);
    return parseInt(isShorthand ? digit + digit : digit, 16) / 255;
  };

  const hasAlpha = digits.length === 4 || digits.length === 8;
  return { red: channel(0), green: channel(1), blue: channel(2), alpha: hasAlpha ? channel(3) : 1 };
};

const toTwoDigitHex = (channel: number): string => {
  return Math.round(channel * 255).toString(16)
    .padStart(2, "0");
};

const hexFromColor = (color: Color): string => {
  const hex = `#${toTwoDigitHex(color.red)}${toTwoDigitHex(color.green)}${toTwoDigitHex(color.blue)}`;
  return color.alpha === 1 ? hex : `${hex}${toTwoDigitHex(color.alpha)}`;
};
