import type { AnnotationRecord } from "./Annotation.ts";

// Only these boolean flags need agreement across alternatives. Other
// annotations (such as titles, descriptions and defaultSnippets) accumulate
// independently, even when their values differ.
const reconciledKeywords = new Set([
  "https://json-schema.org/keyword/deprecated",
  "https://json-schema.org/keyword/unknown#deprecated",
  "https://microsoft.com/keyword/doNotSuggest",
  "https://json-schema.org/keyword/unknown#doNotSuggest"
]);

// Keep transformed records stable across repeated evaluation of the same
// schema. Annotation deduplication in the evaluation plugin uses identity.
const filteredRecords = new WeakMap<AnnotationRecord, Map<string, AnnotationRecord>>();

export function sharedAnnotationKeywords(groups: AnnotationRecord[][]): AnnotationRecord {
  const shared: AnnotationRecord = {};
  if (groups.length === 0) {
    return shared;
  }

  for (const record of groups[0]) {
    for (const [keyword, value] of Object.entries(record)) {
      if (!reconciledKeywords.has(keyword)) {
        continue;
      }

      // A branch may have several records at this location (e.g. $ref and
      // sibling keywords). They are not mutually exclusive alternatives.
      if (groups.every((group) => {
        const values = group.filter((annotation) => Object.prototype.hasOwnProperty.call(annotation, keyword))
          .map((annotation) => annotation[keyword]);
        return values.length > 0 && values.every((candidate) => sameAnnotationValue(candidate, value));
      })) {
        shared[keyword] = value;
      }
    }
  }

  return shared;
}

// Preserve every ordinary annotation. Remove only conditional flags that do
// not agree across the alternatives offering this property. If filtering is
// necessary, cache the resulting object by its original identity and removed
// keywords, so applying a schema twice doesn't duplicate its annotations.
export function withoutUnsharedConditionalKeywords(record: AnnotationRecord, shared: AnnotationRecord): AnnotationRecord {
  const removed = Object.keys(record)
    .filter((keyword) => reconciledKeywords.has(keyword)
      && (!Object.prototype.hasOwnProperty.call(shared, keyword)
        || !sameAnnotationValue(record[keyword], shared[keyword])))
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

  // An annotation record can be populated incrementally during evaluation.
  // Reuse the cached object, but refresh its fields to match the current source.
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

// The flagged keyword values are JSON, so compare objects and arrays by value
// rather than by reference.
function sameAnnotationValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((item, i) => sameAnnotationValue(item, b[i]));
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  return keys.length === Object.keys(bRecord).length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(bRecord, key)
      && sameAnnotationValue(aRecord[key], bRecord[key]));
}
