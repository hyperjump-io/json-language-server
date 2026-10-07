import type { Constructor, JsonSchemaAnnotation } from "./JsonSchemaAnnotation.ts";

// Accessors for the annotations of VS Code's custom keywords. The keywords are
// defined in vocabularies/vscode.ts.

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
