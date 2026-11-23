import { Annotation } from "./Annotation.ts";

import type { AnnotationRecord } from "./Annotation.ts";

// These keywords influence whether a property completion is suppressed.
// Compare their *effective* boolean values across alternatives rather than
// just comparing keyword IDs: an unknown keyword may be recognized through
// a vocabulary fallback, and a deprecation message also implies deprecation.
const suggestionKeywords = new Set([
  "https://microsoft.com/keyword/doNotSuggest",
  "https://json-schema.org/keyword/unknown#doNotSuggest"
]);
const deprecationKeywords = new Set([
  "https://json-schema.org/keyword/deprecated",
  "https://json-schema.org/keyword/unknown#deprecated",
  "https://microsoft.com/keyword/deprecationMessage",
  "https://json-schema.org/keyword/unknown#deprecationMessage",
  "https://microsoft.com/keyword/markdownDeprecationMessage",
  "https://json-schema.org/keyword/unknown#markdownDeprecationMessage"
]);

export type SharedConditionalFlags = { doNotSuggest: boolean; deprecated: boolean };

// Keep transformed records stable across repeated evaluation of the same
// schema. Annotation deduplication in the evaluation plugin uses identity.
const filteredRecords = new WeakMap<AnnotationRecord, Map<string, AnnotationRecord>>();

// Each group is one offering alternative, possibly with several annotation
// records ($ref and sibling keywords can each contribute a record). Only an
// effective true flag in *every* offering alternative is unconditional.
export function sharedConditionalFlags(groups: AnnotationRecord[][]): SharedConditionalFlags {
  return {
    doNotSuggest: groups.length > 0 && groups.every((group) => group.some((record) => new Annotation(record).doNotSuggest())),
    deprecated: groups.length > 0 && groups.every((group) => group.some((record) => new Annotation(record).deprecated()))
  };
}

// Keep titles, descriptions and snippets from each alternative unchanged.
// Only remove conditional suppression/deprecation keywords when not shared.
// A stable cached filtered record retains identity-based deduplication.
export function withoutUnsharedConditionalKeywords(record: AnnotationRecord, shared: SharedConditionalFlags): AnnotationRecord {
  const removed = Object.keys(record)
    .filter((keyword) => (!shared.doNotSuggest && suggestionKeywords.has(keyword))
      || (!shared.deprecated && deprecationKeywords.has(keyword)))
    .sort();

  if (removed.length === 0) {
    return record;
  }

  const key = removed.join("\u0000");
  let cache = filteredRecords.get(record);
  if (!cache) {
    cache = new Map();
    filteredRecords.set(record, cache);
  }

  let filtered = cache.get(key);
  if (!filtered) {
    filtered = {};
    cache.set(key, filtered);
  }

  // Source annotation records may be filled incrementally. Refresh cached
  // contents without changing identity, which is used for deduplication.
  for (const keyword of Object.keys(filtered)) {
    delete filtered[keyword];
  }
  for (const [keyword, value] of Object.entries(record)) {
    if (!removed.includes(keyword)) {
      filtered[keyword] = value;
    }
  }

  return filtered;
}
