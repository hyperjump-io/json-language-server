import { registerSchema } from "@hyperjump/json-schema/draft-2020-12";
import { addKeyword, defineVocabulary } from "@hyperjump/json-schema/experimental";
import * as Browser from "@hyperjump/browser";

import type { Constructor, JsonSchemaAnnotation } from "../evaluation/JsonSchemaAnnotation.ts";

// VS Code's custom keywords. Only active in dialects whose meta-schema includes this vocabulary.
addKeyword({
  id: "https://microsoft.com/keyword/markdownDescription",
  compile: (schema) => Browser.value(schema),
  interpret: () => true,
  annotation: (value: unknown) => value
});

addKeyword({
  id: "https://microsoft.com/keyword/defaultSnippets",
  compile: (schema) => Browser.value(schema),
  interpret: () => true,
  annotation: (value: unknown) => value
});

defineVocabulary("https://microsoft.com/vocab/vscode", {
  markdownDescription: "https://microsoft.com/keyword/markdownDescription",
  defaultSnippets: "https://microsoft.com/keyword/defaultSnippets"
});

registerSchema({
  $id: "https://microsoft.com/meta/vscode",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $dynamicAnchor: "meta",
  properties: {
    markdownDescription: { type: "string" },
    defaultSnippets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          description: { type: "string" },
          markdownDescription: { type: "string" },
          body: true,
          bodyText: { type: "string" }
        }
      }
    }
  }
});

export type DefaultSnippet = {
  label?: string;
  description?: string;
  markdownDescription?: string;
  body?: unknown;
  bodyText?: string;
};

// Schemas that don't use the vocabulary still produce annotations for its
// keywords as unknown keywords.
export const VscodeAnnotation = <T extends Constructor<JsonSchemaAnnotation>>(Base: T) => class extends Base {
  // Prefers markdownDescription over the standard description keyword
  override description(): string | undefined {
    return (this.keywords["https://microsoft.com/keyword/markdownDescription"]
      ?? this.keywords["https://json-schema.org/keyword/unknown#markdownDescription"]
      ?? super.description()) as string | undefined;
  }

  defaultSnippets(): DefaultSnippet[] {
    return (this.keywords["https://microsoft.com/keyword/defaultSnippets"]
      ?? this.keywords["https://json-schema.org/keyword/unknown#defaultSnippets"]
      ?? []) as DefaultSnippet[];
  }
};
