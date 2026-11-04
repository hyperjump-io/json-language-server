import type { AnnotationRecord } from "./Annotation.ts";

// An annotation is shared only when every contributing alternative records the
// same value for its keyword. A contributor is an alternative that offers the
// location, not every alternative of the parent schema.
export function sharedAnnotationKeywords(groups: AnnotationRecord[][]): AnnotationRecord {
  const shared: AnnotationRecord = {};
  if (groups.length === 0) {
    return shared;
  }

  for (const record of groups[0]) {
    for (const [keyword, value] of Object.entries(record)) {
      if (groups.every((group) => {
        let found = false;
        for (const annotation of group) {
          if (Object.prototype.hasOwnProperty.call(annotation, keyword)) {
            found = true;
            if (!sameAnnotationValue(annotation[keyword], value)) {
              return false;
            }
          }
        }
        return found;
      })) {
        shared[keyword] = value;
      }
    }
  }

  return shared;
}

// Preserve the original annotation object when possible. Its identity is used
// to avoid duplicated annotations when the same schema is evaluated twice.
export function withoutSharedKeywords(record: AnnotationRecord, shared: AnnotationRecord): AnnotationRecord {
  const remaining: AnnotationRecord = {};
  let changed = false;
  for (const [keyword, value] of Object.entries(record)) {
    if (Object.prototype.hasOwnProperty.call(shared, keyword) && sameAnnotationValue(value, shared[keyword])) {
      changed = true;
    } else {
      remaining[keyword] = value;
    }
  }
  return changed ? remaining : record;
}

// Keyword annotation values are JSON values; compare nested objects by value
// rather than object identity or property insertion order.
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
