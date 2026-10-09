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

  // A deprecation message deprecates on its own, without the deprecated keyword
  override deprecated(): boolean {
    return super.deprecated() || this.markdownDeprecationMessage() !== undefined;
  }

  deprecationMessage(): string | undefined {
    return (this.keywords["https://microsoft.com/keyword/deprecationMessage"]
      ?? this.keywords["https://json-schema.org/keyword/unknown#deprecationMessage"]) as string | undefined;
  }

  // Prefers markdownDeprecationMessage over deprecationMessage
  markdownDeprecationMessage(): string | undefined {
    return (this.keywords["https://microsoft.com/keyword/markdownDeprecationMessage"]
      ?? this.keywords["https://json-schema.org/keyword/unknown#markdownDeprecationMessage"]
      ?? this.deprecationMessage()) as string | undefined;
  }

  defaultSnippets(): DefaultSnippet[] {
    return (this.keywords["https://microsoft.com/keyword/defaultSnippets"]
      ?? this.keywords["https://json-schema.org/keyword/unknown#defaultSnippets"]
      ?? []) as DefaultSnippet[];
  }
};
