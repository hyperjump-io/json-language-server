import "../vocabularies/vscode.ts";
import { compile, getSchema } from "@hyperjump/json-schema/experimental";

import type { AnnotationRecord, BaseAnnotation, Constructor } from "./Annotation.ts";

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
  deprecated(): boolean;
};

// Schemas that don't use the vocabulary still produce annotations for its
// keywords as unknown keywords.
export const VscodeAnnotation = <T extends Constructor<Extended>>(Base: T) => class extends Base {
  markdownDescription(): string | undefined {
    return (this.keywords["https://microsoft.com/keyword/markdownDescription"]
      ?? this.unknownKeyword("markdownDescription", `${metaSchemaUri}#/properties/markdownDescription`, ast)) as string | undefined;
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

  doNotSuggest(): boolean {
    return ((this.keywords["https://microsoft.com/keyword/doNotSuggest"]
      ?? this.unknownKeyword("doNotSuggest", `${metaSchemaUri}#/properties/doNotSuggest`, ast)) === true);
  }

  // Whether the schema has an enum, whose values could be described
  hasEnum(): boolean {
    return "https://json-schema.org/keyword/enum" in this.keywords;
  }

  // VS Code describes an enum value with the description at the same position
  // in enumDescriptions. The value is its canonical JSON, which is how the
  // enum values are recorded. A value that isn't in the enum or has no
  // description at its position isn't described.
  enumDescription(value: string): string | undefined {
    const descriptions = (this.keywords["https://microsoft.com/keyword/enumDescriptions"]
      ?? this.unknownKeyword("enumDescriptions", `${metaSchemaUri}#/properties/enumDescriptions`, ast)) as string[] | undefined;
    return descriptions?.[this.enumIndex(value)];
  }

  markdownEnumDescription(value: string): string | undefined {
    const descriptions = (this.keywords["https://microsoft.com/keyword/markdownEnumDescriptions"]
      ?? this.unknownKeyword("markdownEnumDescriptions", `${metaSchemaUri}#/properties/markdownEnumDescriptions`, ast)) as string[] | undefined;
    return descriptions?.[this.enumIndex(value)];
  }

  // The position of the first occurrence of a value in the enum, or -1 if it
  // isn't in the enum, which has no description. The positions are indexed
  // once per record because they're looked up for every completion of the
  // enum.
  private enumIndex(value: string): number {
    let positions = enumPositions.get(this.keywords);
    if (!positions) {
      positions = new Map();
      const enumValues = (this.keywords["https://json-schema.org/keyword/enum"] ?? []) as string[];
      for (const [index, enumValue] of enumValues.entries()) {
        if (!positions.has(enumValue)) {
          positions.set(enumValue, index);
        }
      }
      enumPositions.set(this.keywords, positions);
    }

    return positions.get(value) ?? -1;
  }
};

const enumPositions = new WeakMap<AnnotationRecord, Map<string, number>>();
