import { MarkupKind } from "vscode-languageserver";

import type { MarkupContent } from "vscode-languageserver";
import type { Annotation } from "../evaluation/Annotation.ts";

// The titles and descriptions of the annotations in the order they appear.
// Prefers markdownDescription over the standard description keyword.
export const describeAnnotations = (annotations: Annotation[], supportsMarkdown: boolean): MarkupContent[] => {
  const documentation: MarkupContent[] = [];
  for (const annotation of annotations) {
    const title = annotation.title();
    if (title) {
      documentation.push(supportsMarkdown
        ? { kind: MarkupKind.Markdown, value: `**${escapeMarkdown(title)}**` }
        : { kind: MarkupKind.PlainText, value: title });
    }

    const markdownDescription = supportsMarkdown ? annotation.markdownDescription() : undefined;
    const description = annotation.description();
    if (markdownDescription) {
      documentation.push({ kind: MarkupKind.Markdown, value: markdownDescription });
    } else if (description) {
      documentation.push({ kind: MarkupKind.PlainText, value: description });
    }
  }

  return documentation;
};

export const supportsMarkdown = (formats: MarkupKind[] | undefined) => !!formats?.includes(MarkupKind.Markdown);

// Joins documentation into paragraphs. Markdown if any of it is markdown,
// otherwise plain text. Plain text is escaped when it's combined with markdown.
export const joinDocumentation = (documentation: MarkupContent[]): MarkupContent | undefined => {
  if (documentation.length === 0) {
    return;
  }

  const isMarkdown = documentation.some(({ kind }) => kind === MarkupKind.Markdown);
  const value = documentation
    .map(({ kind, value }) => isMarkdown && kind === MarkupKind.PlainText ? escapeMarkdown(value) : value)
    .join("\n\n");

  return { kind: isMarkdown ? MarkupKind.Markdown : MarkupKind.PlainText, value };
};

// Any ASCII punctuation can be escaped, so escaping all of it is always safe.
// Single line breaks would be joined into one paragraph, so they're made into
// paragraph breaks.
const escapeMarkdown = (text: string) => text
  .replace(/[!-/:-@[-`{-~]/g, "\\$&")
  .replace(/([^\n\r])(\r?\n)([^\n\r])/g, "$1\n\n$3");
