import * as Pact from "@hyperjump/pact";
import "@hyperjump/json-schema/draft-2020-12";
import { compile, getSchema } from "@hyperjump/json-schema/experimental";

import type { Json } from "@hyperjump/json-pointer";
import type { BaseAnnotation, Constructor } from "./Annotation.ts";

const FORMAT_KEYWORDS = [
  "https://json-schema.org/keyword/draft-2020-12/format",
  "https://json-schema.org/keyword/draft-2020-12/format-assertion",
  "https://json-schema.org/keyword/draft-2019-09/format",
  "https://json-schema.org/keyword/draft-2019-09/format-assertion",
  "https://json-schema.org/keyword/draft-07/format",
  "https://json-schema.org/keyword/draft-06/format",
  "https://json-schema.org/keyword/draft-04/format"
];

const metaSchemaUri = "https://json-schema.org/draft/2020-12/meta/meta-data";
const schema = await getSchema(metaSchemaUri);
const { ast } = await compile(schema);

// Accessors for the standard JSON Schema annotations. Some keywords have more
// than one URI depending on the dialect.
export const JsonSchemaAnnotation = <T extends Constructor<BaseAnnotation>>(Base: T) => class extends Base {
  title(): string | undefined {
    return this.keywords["https://json-schema.org/keyword/title"] as string | undefined;
  }

  description(): string | undefined {
    return this.keywords["https://json-schema.org/keyword/description"] as string | undefined;
  }

  // The deprecated keyword was added in 2019-09, but it's commonly used with
  // earlier dialects anyway
  deprecated(): boolean {
    return (this.keywords["https://json-schema.org/keyword/deprecated"]
      ?? this.unknownKeyword("deprecated", `${metaSchemaUri}#/properties/deprecated`, ast)) === true;
  }

  // Undefined if there's no default. A default of null is still a default.
  default(): Json | undefined {
    return this.keywords["https://json-schema.org/keyword/default"] as Json | undefined;
  }

  // The examples keyword was added in draft-06, but it's commonly used with
  // draft-04 anyway
  examples(): Json[] {
    return (this.keywords["https://json-schema.org/keyword/examples"]
      ?? this.unknownKeyword("examples", `${metaSchemaUri}#/properties/examples`, ast)
      ?? []) as Json[];
  }

  formats(): unknown[] {
    return Pact.pipe(
      FORMAT_KEYWORDS,
      Pact.filter((keywordId) => keywordId in this.keywords),
      Pact.map((keywordId) => this.keywords[keywordId]),
      Pact.collectArray
    );
  }
};
