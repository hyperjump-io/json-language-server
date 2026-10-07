import * as Pact from "@hyperjump/pact";

// The annotations one schema contributed to an instance location, keyed by
// keyword URI
export type AnnotationRecord = Record<string, unknown>;

// Vocabularies add accessors for the annotations of their keywords by
// extending JsonSchemaAnnotation with a mixin. The mixins are composed into the
// Annotation class in Annotation.ts.
export type Constructor<T> = new (...args: any[]) => T;

const FORMAT_KEYWORDS = [
  "https://json-schema.org/keyword/draft-2020-12/format",
  "https://json-schema.org/keyword/draft-2020-12/format-assertion",
  "https://json-schema.org/keyword/draft-2019-09/format",
  "https://json-schema.org/keyword/draft-2019-09/format-assertion",
  "https://json-schema.org/keyword/draft-07/format",
  "https://json-schema.org/keyword/draft-06/format",
  "https://json-schema.org/keyword/draft-04/format"
];

// Accessors for the standard JSON Schema annotations. Some keywords have more
// than one URI depending on the dialect.
export class JsonSchemaAnnotation {
  protected keywords: AnnotationRecord;

  constructor(keywords: AnnotationRecord) {
    this.keywords = keywords;
  }

  title(): string | undefined {
    return this.keywords["https://json-schema.org/keyword/title"] as string | undefined;
  }

  description(): string | undefined {
    return this.keywords["https://json-schema.org/keyword/description"] as string | undefined;
  }

  formats(): unknown[] {
    return Pact.pipe(
      FORMAT_KEYWORDS,
      Pact.filter((keywordId) => keywordId in this.keywords),
      Pact.map((keywordId) => this.keywords[keywordId]),
      Pact.collectArray
    );
  }
}
