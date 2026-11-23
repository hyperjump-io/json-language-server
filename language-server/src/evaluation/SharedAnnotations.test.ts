import { describe, expect, test } from "vitest";
import { sharedConditionalFlags, withoutUnsharedConditionalKeywords } from "./SharedAnnotations.ts";

import type { AnnotationRecord } from "./Annotation.ts";

const TITLE = "https://json-schema.org/keyword/title";
const DEPRECATED = "https://json-schema.org/keyword/deprecated";
const MESSAGE = "https://json-schema.org/keyword/unknown#deprecationMessage";
const MARKDOWN_MESSAGE = "https://json-schema.org/keyword/unknown#markdownDeprecationMessage";
const SUGGEST = "https://json-schema.org/keyword/unknown#doNotSuggest";

describe("alternative conditional annotations", () => {
  test("a flag is shared only if every offering alternative has that effective flag", () => {
    expect(sharedConditionalFlags([[{ [SUGGEST]: true }], [{ [TITLE]: "Different" }]]))
      .toEqual({ doNotSuggest: false, deprecated: false });
    expect(sharedConditionalFlags([[{ [DEPRECATED]: true }], [{ [MESSAGE]: "Use another." }]]))
      .toEqual({ doNotSuggest: false, deprecated: true });
  });

  test("different deprecation messages imply deprecation even without deprecated: true", () => {
    expect(sharedConditionalFlags([
      [{ [MESSAGE]: "Use something else." }],
      [{ [MARKDOWN_MESSAGE]: "Use **another** property." }]
    ])).toEqual({ doNotSuggest: false, deprecated: true });

    expect(sharedConditionalFlags([
      [{ [MESSAGE]: "Use something else." }],
      [{ [TITLE]: "Not deprecated" }]
    ])).toEqual({ doNotSuggest: false, deprecated: false });
  });

  test("filtering preserves ordinary annotations and stable record identity", () => {
    const source: AnnotationRecord = { [TITLE]: "Name", [MESSAGE]: "Use fullName." };
    const flags = { doNotSuggest: false, deprecated: false };
    const first = withoutUnsharedConditionalKeywords(source, flags);
    const second = withoutUnsharedConditionalKeywords(source, flags);

    expect(first).toBe(second);
    expect(first).not.toBe(source);
    expect(first).toEqual({ [TITLE]: "Name" });
    expect(source[MESSAGE]).toBe("Use fullName.");
    expect(withoutUnsharedConditionalKeywords(source, { doNotSuggest: false, deprecated: true })).toBe(source);
  });

  test("cached filtered annotations refresh when the source record is populated later", () => {
    const source: AnnotationRecord = { [SUGGEST]: true };
    const flags = { doNotSuggest: false, deprecated: false };
    const first = withoutUnsharedConditionalKeywords(source, flags);
    source[TITLE] = "Added later";
    const second = withoutUnsharedConditionalKeywords(source, flags);

    expect(second).toBe(first);
    expect(second).toEqual({ [TITLE]: "Added later" });
  });
});
