import * as Pact from "@hyperjump/pact";

import type { Annotation } from "./LspEvaluationPlugin.ts";

// Accessors for standard JSON Schema annotations, which are keyed by keyword
// URI. Some keywords have more than one URI depending on the dialect. Use
// getDescription from the VS Code vocabulary rather than reading description
// here so markdownDescription is preferred everywhere.

const FORMAT_KEYWORDS = [
  "https://json-schema.org/keyword/draft-2020-12/format",
  "https://json-schema.org/keyword/draft-2020-12/format-assertion",
  "https://json-schema.org/keyword/draft-2019-09/format",
  "https://json-schema.org/keyword/draft-2019-09/format-assertion",
  "https://json-schema.org/keyword/draft-07/format",
  "https://json-schema.org/keyword/draft-06/format",
  "https://json-schema.org/keyword/draft-04/format"
];

export const getTitle = (annotation: Annotation): string | undefined => {
  return annotation["https://json-schema.org/keyword/title"] as string | undefined;
};

export const getFormats = (annotation: Annotation): unknown[] => {
  return Pact.pipe(
    FORMAT_KEYWORDS,
    Pact.filter((keywordId) => keywordId in annotation),
    Pact.map((keywordId) => annotation[keywordId]),
    Pact.collectArray
  );
};
