import type { Annotation } from "../LspEvaluationPlugin.ts";

export type JsonSchemaType = "string" | "number" | "integer" | "boolean" | "null" | "array" | "object";

export type ValueEntry = { kind: "value"; value: string; annotations: Annotation[] };

export type TypeEntry = {
  kind: "type";
  type: JsonSchemaType;
  excluded: string[];
  included: string[];
  annotations: Annotation[];
};

export type SetEntry = ValueEntry | TypeEntry;

// Each bucket tracks the annotations of the members it admits. A finite bucket
// has annotations per value. A cofinite bucket has annotations for every value
// it admits, which can be overridden for specific values.
type FiniteBucket = { kind: "finite"; values: Map<string, Annotation[]> };
type CofiniteBucket = {
  kind: "cofinite";
  excluded: Set<string>;
  included: Set<string>;
  annotations: Annotation[];
  valueAnnotations: Map<string, Annotation[]>;
};
type Bucket = FiniteBucket | CofiniteBucket;

const ALL_TYPES: JsonSchemaType[] = ["null", "boolean", "integer", "number", "string", "array", "object"];

const CLOSED_DOMAINS: Partial<Record<JsonSchemaType, Set<string>>> = {
  null: new Set(["null"]),
  boolean: new Set(["true", "false"])
};

export class JsonValueSet {
  private buckets = new Map<JsonSchemaType, Bucket>();
  // Annotations that apply to the location no matter which member the value
  // is. They only become member annotations when the set is made conditional
  // with withMemberAnnotations.
  private annotations: Annotation[] = [];

  static any(): JsonValueSet {
    return new JsonValueSet()
      .addType("null")
      .addType("boolean")
      .addType("number")
      .addType("string")
      .addType("array")
      .addType("object");
  }

  addValue(value: string): this {
    const type = jsonTypeOf(value);
    const bucket = this.buckets.get(type);

    if (!bucket) {
      this.buckets.set(type, { kind: "finite", values: new Map([[value, []]]) });
      return this;
    }

    if (bucket.kind === "finite") {
      if (!bucket.values.has(value)) {
        bucket.values.set(value, []);
      }
    } else {
      bucket.excluded.delete(value);
      bucket.included.add(value);
    }

    return this;
  }

  addType(type: JsonSchemaType): this {
    const domain = CLOSED_DOMAINS[type];
    if (domain) {
      for (const value of domain) {
        this.addValue(value);
      }
      return this;
    }

    if (type === "number") {
      this.buckets.set("integer", emptyCofiniteBucket());
      this.buckets.set("number", emptyCofiniteBucket());
      return this;
    }

    this.buckets.set(type, emptyCofiniteBucket());
    return this;
  }

  deleteValue(value: string): this {
    const type = jsonTypeOf(value);
    const bucket = this.buckets.get(type);
    if (!bucket) {
      return this;
    }

    if (bucket.kind === "finite") {
      bucket.values.delete(value);
      if (bucket.values.size === 0) {
        this.buckets.delete(type);
      }
    } else {
      bucket.excluded.add(value);
      bucket.included.delete(value);
      bucket.valueAnnotations.delete(value);
    }

    return this;
  }

  deleteType(type: JsonSchemaType): this {
    if (type === "number") {
      this.buckets.delete("integer");
      this.buckets.delete("number");
      return this;
    }

    this.buckets.delete(type);
    return this;
  }

  hasValue(value: string): boolean {
    const bucket = this.buckets.get(jsonTypeOf(value));
    return !!bucket && admits(bucket, value);
  }

  hasType(type: JsonSchemaType): boolean {
    if (type === "number") {
      return this.isFullBucket("integer") && this.isFullBucket("number");
    }

    const domain = CLOSED_DOMAINS[type];
    if (domain) {
      const bucket = this.buckets.get(type);
      return !!bucket && bucket.kind === "finite" && [...domain].every((value) => bucket.values.has(value));
    }

    return this.isFullBucket(type);
  }

  private isFullBucket(type: JsonSchemaType): boolean {
    const bucket = this.buckets.get(type);
    return !!bucket && bucket.kind === "cofinite" && bucket.excluded.size === 0;
  }

  isEmpty(): boolean {
    return this.buckets.size === 0;
  }

  // Adds an annotation that applies to the location no matter which member
  // the value is
  annotate(annotation: Annotation): this {
    this.annotations = mergeAnnotations(this.annotations, [annotation]);
    return this;
  }

  // The annotations that apply only to some members of the set. Annotations
  // that apply no matter which member the value is aren't included.
  getValueAnnotations(value: string): Annotation[] {
    const bucket = this.buckets.get(jsonTypeOf(value));
    return bucket && admits(bucket, value) ? annotationsOf(bucket, value) : [];
  }

  clone(): JsonValueSet {
    const copy = new JsonValueSet();
    for (const [type, bucket] of this.buckets) {
      copy.buckets.set(type, cloneBucket(bucket));
    }
    copy.annotations = [...this.annotations];
    return copy;
  }

  // Makes the location annotations apply only to this set's members. Use this
  // when the set is one alternative for the value at a location, such as an
  // anyOf alternative, before combining it with the others.
  withMemberAnnotations(): JsonValueSet {
    const copy = this.clone();
    copy.annotations = [];
    for (const bucket of copy.buckets.values()) {
      if (bucket.kind === "finite") {
        for (const [value, annotations] of bucket.values) {
          bucket.values.set(value, mergeAnnotations(annotations, this.annotations));
        }
      } else {
        bucket.annotations = mergeAnnotations(bucket.annotations, this.annotations);
        for (const [value, annotations] of bucket.valueAnnotations) {
          bucket.valueAnnotations.set(value, mergeAnnotations(annotations, this.annotations));
        }
      }
    }
    return copy;
  }

  // Location annotations from every set still apply to every member. Members
  // keep the annotations from the one set that admits them.
  static exclusiveUnion(sets: JsonValueSet[]): JsonValueSet {
    const result = new JsonValueSet();
    for (const set of sets) {
      result.annotations = mergeAnnotations(result.annotations, set.annotations);
    }

    for (const type of ALL_TYPES) {
      const buckets: Bucket[] = [];
      for (const s of sets) {
        const b = s.buckets.get(type);
        if (b) {
          buckets.push(b);
        }
      }
      if (buckets.length === 0) {
        continue;
      }

      const cofiniteBuckets = buckets.filter((b): b is CofiniteBucket => b.kind === "cofinite");
      const finiteBuckets = buckets.filter((b): b is FiniteBucket => b.kind === "finite");
      const backgroundCount = cofiniteBuckets.length;

      const named = new Set<string>();
      for (const cb of cofiniteBuckets) {
        for (const v of cb.excluded) {
          named.add(v);
        }
        for (const v of cb.included) {
          named.add(v);
        }
      }
      for (const fb of finiteBuckets) {
        for (const v of fb.values.keys()) {
          named.add(v);
        }
      }

      const admittingBuckets = (v: string) => buckets.filter((b) => admits(b, v));

      if (backgroundCount === 1) {
        const [background] = cofiniteBuckets;
        const excluded = new Set<string>();
        const included = new Set<string>();
        const valueAnnotations = new Map<string, Annotation[]>();
        for (const v of named) {
          const admitting = admittingBuckets(v);
          if (admitting.length !== 1) {
            excluded.add(v);
          } else {
            included.add(v);
            valueAnnotations.set(v, annotationsOf(admitting[0], v));
          }
        }
        for (const v of background.valueAnnotations.keys()) {
          if (!named.has(v)) {
            valueAnnotations.set(v, annotationsOf(background, v));
          }
        }
        result.buckets.set(type, { kind: "cofinite", excluded, included, annotations: background.annotations, valueAnnotations });
      } else {
        const values = new Map<string, Annotation[]>();
        for (const v of named) {
          const admitting = admittingBuckets(v);
          if (admitting.length === 1) {
            values.set(v, annotationsOf(admitting[0], v));
          }
        }
        if (values.size) {
          result.buckets.set(type, { kind: "finite", values });
        }
      }
    }

    return result;
  }

  // Location annotations from both sets still apply to every member, and
  // members keep the annotations from both sets.
  intersect(other: JsonValueSet): JsonValueSet {
    const result = new JsonValueSet();
    result.annotations = mergeAnnotations(this.annotations, other.annotations);

    for (const type of ALL_TYPES) {
      const a = this.buckets.get(type);
      const b = other.buckets.get(type);
      if (!a || !b) {
        continue;
      }

      if (a.kind === "cofinite" && b.kind === "cofinite") {
        const excluded = new Set([...a.excluded, ...b.excluded]);
        const included = new Set<string>();
        for (const v of [...a.included, ...b.included]) {
          if (!excluded.has(v)) {
            included.add(v);
          }
        }
        const valueAnnotations = new Map<string, Annotation[]>();
        for (const v of [...a.valueAnnotations.keys(), ...b.valueAnnotations.keys()]) {
          if (!excluded.has(v)) {
            valueAnnotations.set(v, mergeAnnotations(annotationsOf(a, v), annotationsOf(b, v)));
          }
        }
        result.buckets.set(type, {
          kind: "cofinite",
          excluded,
          included,
          annotations: mergeAnnotations(a.annotations, b.annotations),
          valueAnnotations
        });
      } else {
        const finite = a.kind === "finite" ? a : (b as FiniteBucket);
        const other = a.kind === "finite" ? b : a;
        const values = new Map<string, Annotation[]>();
        for (const v of finite.values.keys()) {
          if (admits(other, v)) {
            values.set(v, mergeAnnotations(annotationsOf(a, v), annotationsOf(b, v)));
          }
        }
        if (values.size) {
          result.buckets.set(type, { kind: "finite", values });
        }
      }
    }

    return result;
  }

  // Location annotations from both sets still apply to every member. Members
  // keep the annotations from whichever sets admit them.
  union(other: JsonValueSet): JsonValueSet {
    const result = new JsonValueSet();
    result.annotations = mergeAnnotations(this.annotations, other.annotations);

    for (const type of ALL_TYPES) {
      const a = this.buckets.get(type);
      const b = other.buckets.get(type);

      if (a && !b) {
        result.buckets.set(type, cloneBucket(a));
        continue;
      }

      if (!a && b) {
        result.buckets.set(type, cloneBucket(b));
        continue;
      }

      if (!a || !b) {
        continue;
      }

      const annotationsOfUnion = (v: string) => mergeAnnotations(
        admits(a, v) ? annotationsOf(a, v) : [],
        admits(b, v) ? annotationsOf(b, v) : []
      );

      if (a.kind === "finite" && b.kind === "finite") {
        const values = new Map<string, Annotation[]>();
        for (const v of [...a.values.keys(), ...b.values.keys()]) {
          values.set(v, annotationsOfUnion(v));
        }
        result.buckets.set(type, { kind: "finite", values });
      } else if (a.kind === "cofinite" && b.kind === "cofinite") {
        // excluded from the union only if excluded from BOTH sides
        const excluded = new Set<string>();
        for (const v of a.excluded) {
          if (b.excluded.has(v)) {
            excluded.add(v);
          }
        }
        const included = new Set<string>();
        for (const v of [...a.included, ...b.included]) {
          if (!excluded.has(v)) {
            included.add(v);
          }
        }
        // Values excluded from only one side are admitted by only the other
        const valueAnnotations = new Map<string, Annotation[]>();
        for (const v of [...a.excluded, ...b.excluded, ...a.valueAnnotations.keys(), ...b.valueAnnotations.keys()]) {
          if (!excluded.has(v)) {
            valueAnnotations.set(v, annotationsOfUnion(v));
          }
        }
        result.buckets.set(type, {
          kind: "cofinite",
          excluded,
          included,
          annotations: mergeAnnotations(a.annotations, b.annotations),
          valueAnnotations
        });
      } else {
        const finite = a.kind === "finite" ? a : (b as FiniteBucket);
        const co = a.kind === "cofinite" ? a : (b as CofiniteBucket);
        const excluded = new Set<string>();
        for (const v of co.excluded) {
          if (!finite.values.has(v)) {
            excluded.add(v);
          }
        }
        const included = new Set(co.included);
        for (const v of finite.values.keys()) {
          included.add(v);
        }
        const valueAnnotations = new Map<string, Annotation[]>();
        for (const v of [...finite.values.keys(), ...co.valueAnnotations.keys()]) {
          if (!excluded.has(v)) {
            valueAnnotations.set(v, annotationsOfUnion(v));
          }
        }
        result.buckets.set(type, { kind: "cofinite", excluded, included, annotations: co.annotations, valueAnnotations });
      }
    }

    return result;
  }

  // Annotations describe the members of the set, so none of them apply to
  // the complement
  complement(): JsonValueSet {
    const result = new JsonValueSet();

    for (const type of ALL_TYPES) {
      const bucket = this.buckets.get(type);
      const domain = CLOSED_DOMAINS[type];

      if (domain) {
        const complementValues = new Map<string, Annotation[]>();
        for (const value of domain) {
          if (!bucket || !admits(bucket, value)) {
            complementValues.set(value, []);
          }
        }
        if (complementValues.size > 0) {
          result.buckets.set(type, { kind: "finite", values: complementValues });
        }
        continue;
      }

      if (!bucket) {
        result.buckets.set(type, emptyCofiniteBucket());
      } else if (bucket.kind === "finite") {
        result.buckets.set(type, { ...emptyCofiniteBucket(), excluded: new Set(bucket.values.keys()) });
      } else if (bucket.excluded.size > 0) {
        result.buckets.set(type, { kind: "finite", values: new Map([...bucket.excluded].map((value) => [value, []])) });
      }
    }

    return result;
  }

  * [Symbol.iterator](): IterableIterator<SetEntry> {
    const mergeNumber = this.hasType("number");

    for (const [type, bucket] of this.buckets) {
      if (type === "integer" && mergeNumber) {
        continue;
      }

      if (bucket.kind === "finite") {
        for (const [value, annotations] of bucket.values) {
          yield { kind: "value", value, annotations };
        }
      } else if (type === "number" && mergeNumber) {
        const integerBucket = this.buckets.get("integer") as CofiniteBucket;
        const included = new Set([...integerBucket.included, ...bucket.included]);
        const annotations = mergeAnnotations(integerBucket.annotations, bucket.annotations);
        yield { kind: "type", type: "number", excluded: [], included: [...included], annotations };
      } else {
        yield { kind: "type", type, excluded: [...bucket.excluded], included: [...bucket.included], annotations: bucket.annotations };
      }
    }
  }
}

function emptyCofiniteBucket(): CofiniteBucket {
  return { kind: "cofinite", excluded: new Set(), included: new Set(), annotations: [], valueAnnotations: new Map() };
}

function cloneBucket(bucket: Bucket): Bucket {
  return bucket.kind === "finite"
    ? { kind: "finite", values: new Map(bucket.values) }
    : {
        kind: "cofinite",
        excluded: new Set(bucket.excluded),
        included: new Set(bucket.included),
        annotations: bucket.annotations,
        valueAnnotations: new Map(bucket.valueAnnotations)
      };
}

function admits(bucket: Bucket, value: string): boolean {
  return bucket.kind === "finite" ? bucket.values.has(value) : !bucket.excluded.has(value);
}

function annotationsOf(bucket: Bucket, value: string): Annotation[] {
  return bucket.kind === "finite"
    ? bucket.values.get(value) ?? []
    : bucket.valueAnnotations.get(value) ?? bucket.annotations;
}

// Sets built from the same schema share annotation objects, so they're
// deduplicated by identity.
function mergeAnnotations(a: Annotation[], b: Annotation[]): Annotation[] {
  const result = [...a];
  for (const annotation of b) {
    if (!result.includes(annotation)) {
      result.push(annotation);
    }
  }
  return result;
}

function jsonTypeOf(canonical: string): JsonSchemaType {
  const c = canonical.trimStart()[0];
  switch (c) {
    case "n":
      return "null";
    case "t":
    case "f":
      return "boolean";
    case "\"":
      return "string";
    case "[":
      return "array";
    case "{":
      return "object";
    default: {
      const n = JSON.parse(canonical) as number; // digits or '-' => a JSON number literal
      return Number.isInteger(n) ? "integer" : "number";
    }
  }
}
