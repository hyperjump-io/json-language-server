import "../vocabularies/vscode.ts";
import { compile, getSchema } from "@hyperjump/json-schema/experimental";

import type { BaseAnnotation, Constructor } from "./Annotation.ts";

// Accessors for the annotations of VS Code's custom keywords. The keywords are
// defined in vocabularies/vscode.ts.

export type DefaultSnippet = {
  label?: string;
  description?: string;
  markdownDescription?: string;
  body?: unknown;
  bodyText?: string;
};

const metaSchemaUri = "https://microsoft.com/meta/vscode";
const schema = await getSchema(metaSchemaUri);
const { ast } = await compile(schema);

// The accessors this mixin extends
type Extended = BaseAnnotation & {
  description(): string | undefined;
  deprecated(): boolean;
};

// Schemas that don't use the vocabulary still produce annotations for its
// keywords as unknown keywords.
export const VscodeAnnotation = <T extends Constructor<Extended>>(Base: T) => class extends Base {
  // Prefers markdownDescription over the standard description keyword
  override description(): string | undefined {
    return (this.keywords["https://microsoft.com/keyword/markdownDescription"]
      ?? this.unknownKeyword("markdownDescription", `${metaSchemaUri}#/properties/markdownDescription`, ast)
      ?? super.description()) as string | undefined;
  }

  // A deprecation message deprecates on its own, without the deprecated keyword
  override deprecated(): boolean {
    return super.deprecated()
      || this.deprecationMessage() !== undefined
      || this.markdownDeprecationMessage() !== undefined;
  }

  // An empty message is the same as no message
  deprecationMessage(): string | undefined {
    const message = this.keywords["https://microsoft.com/keyword/deprecationMessage"]
      ?? this.unknownKeyword("deprecationMessage", `${metaSchemaUri}#/properties/deprecationMessage`, ast);
    return (message || undefined) as string | undefined;
  }

  // An empty message is the same as no message
  markdownDeprecationMessage(): string | undefined {
    const message = this.keywords["https://microsoft.com/keyword/markdownDeprecationMessage"]
      ?? this.unknownKeyword("markdownDeprecationMessage", `${metaSchemaUri}#/properties/markdownDeprecationMessage`, ast);
    return (message || undefined) as string | undefined;
  }

  defaultSnippets(): DefaultSnippet[] {
    return (this.keywords["https://microsoft.com/keyword/defaultSnippets"]
      ?? this.unknownKeyword("defaultSnippets", `${metaSchemaUri}#/properties/defaultSnippets`, ast)
      ?? []) as DefaultSnippet[];
  }
};
