export type JsonSchemaType = "string" | "number" | "integer" | "boolean" | "null" | "array" | "object";

export type ValueEntry = { kind: "value"; value: string };

export type TypeEntry = {
  kind: "type";
  type: JsonSchemaType;
  excluded: string[];
  included: string[];
};

export type SetEntry = ValueEntry | TypeEntry;

type FiniteBucket = { kind: "finite"; values: Set<string> };
type CofiniteBucket = { kind: "cofinite"; excluded: Set<string>; included: Set<string> };
type Bucket = FiniteBucket | CofiniteBucket;

const ALL_TYPES: JsonSchemaType[] = ["null", "boolean", "integer", "number", "string", "array", "object"];

const CLOSED_DOMAINS: Partial<Record<JsonSchemaType, Set<string>>> = {
  null: new Set(["null"]),
  boolean: new Set(["true", "false"])
};

export class JsonValueSet {
  private buckets = new Map<JsonSchemaType, Bucket>();

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
      this.buckets.set(type, { kind: "finite", values: new Set([value]) });
      return this;
    }

    if (bucket.kind === "finite") {
      bucket.values.add(value);
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
      this.buckets.set("integer", { kind: "cofinite", excluded: new Set(), included: new Set() });
      this.buckets.set("number", { kind: "cofinite", excluded: new Set(), included: new Set() });
      return this;
    }

    this.buckets.set(type, { kind: "cofinite", excluded: new Set(), included: new Set() });
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
    const type = jsonTypeOf(value);
    const bucket = this.buckets.get(type);
    if (!bucket) {
      return false;
    }

    return bucket.kind === "finite" ? bucket.values.has(value) : !bucket.excluded.has(value);
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

  clone(): JsonValueSet {
    const copy = new JsonValueSet();
    for (const [type, bucket] of this.buckets) {
      copy.buckets.set(type, cloneBucket(bucket));
    }
    return copy;
  }

  static exclusiveUnion(sets: JsonValueSet[]): JsonValueSet {
    const result = new JsonValueSet();

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
        for (const v of fb.values) {
          named.add(v);
        }
      }

      const countOf = (v: string): number => {
        let count = 0;
        for (const cb of cofiniteBuckets) {
          if (!cb.excluded.has(v)) {
            count++;
          }
        }
        for (const fb of finiteBuckets) {
          if (fb.values.has(v)) {
            count++;
          }
        }

        return count;
      };

      if (backgroundCount === 1) {
        const excluded = new Set<string>();
        const included = new Set<string>();
        for (const v of named) {
          if (countOf(v) !== 1) {
            excluded.add(v);
          } else {
            included.add(v);
          }
        }
        result.buckets.set(type, { kind: "cofinite", excluded, included });
      } else {
        const values = new Set<string>();
        for (const v of named) {
          if (countOf(v) === 1) {
            values.add(v);
          }
        }
        if (values.size) {
          result.buckets.set(type, { kind: "finite", values });
        }
      }
    }

    return result;
  }

  intersect(other: JsonValueSet): JsonValueSet {
    const result = new JsonValueSet();

    for (const type of ALL_TYPES) {
      const a = this.buckets.get(type);
      const b = other.buckets.get(type);
      if (!a || !b) {
        continue;
      }

      if (a.kind === "finite" && b.kind === "finite") {
        const values = new Set<string>();
        for (const v of a.values) {
          if (b.values.has(v)) {
            values.add(v);
          }
        }
        if (values.size) {
          result.buckets.set(type, { kind: "finite", values });
        }
      } else if (a.kind === "finite" && b.kind === "cofinite") {
        const values = new Set<string>();
        for (const v of a.values) {
          if (!b.excluded.has(v)) {
            values.add(v);
          }
        }
        if (values.size) {
          result.buckets.set(type, { kind: "finite", values });
        }
      } else if (a.kind === "cofinite" && b.kind === "finite") {
        const values = new Set<string>();
        for (const v of b.values) {
          if (!a.excluded.has(v)) {
            values.add(v);
          }
        }
        if (values.size) {
          result.buckets.set(type, { kind: "finite", values });
        }
      } else {
        const aCo = a as CofiniteBucket;
        const bCo = b as CofiniteBucket;
        const excluded = new Set(aCo.excluded);
        for (const v of bCo.excluded) {
          excluded.add(v);
        }
        const included = new Set<string>();
        for (const v of [...aCo.included, ...bCo.included]) {
          if (!excluded.has(v)) {
            included.add(v);
          }
        }
        result.buckets.set(type, { kind: "cofinite", excluded, included });
      }
    }

    return result;
  }

  union(other: JsonValueSet): JsonValueSet {
    const result = new JsonValueSet();

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

      if (a.kind === "finite" && b.kind === "finite") {
        const values = new Set(a.values);
        for (const v of b.values) {
          values.add(v);
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
        result.buckets.set(type, { kind: "cofinite", excluded, included });
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
        for (const v of finite.values) {
          included.add(v);
        }
        result.buckets.set(type, { kind: "cofinite", excluded, included });
      }
    }

    return result;
  }

  complement(): JsonValueSet {
    const result = new JsonValueSet();

    for (const type of ALL_TYPES) {
      const bucket = this.buckets.get(type);
      const domain = CLOSED_DOMAINS[type];

      if (domain) {
        const values = bucket && bucket.kind === "finite" ? bucket.values : new Set<string>();
        const complementValues = new Set<string>();
        for (const value of domain) {
          if (!values.has(value)) {
            complementValues.add(value);
          }
        }
        if (complementValues.size > 0) {
          result.buckets.set(type, { kind: "finite", values: complementValues });
        }
        continue;
      }

      if (!bucket) {
        result.buckets.set(type, { kind: "cofinite", excluded: new Set(), included: new Set() });
      } else if (bucket.kind === "finite") {
        result.buckets.set(type, { kind: "cofinite", excluded: new Set(bucket.values), included: new Set() });
      } else if (bucket.excluded.size > 0) {
        result.buckets.set(type, { kind: "finite", values: new Set(bucket.excluded) });
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
        for (const value of bucket.values) {
          yield { kind: "value", value };
        }
      } else if (type === "number" && mergeNumber) {
        const integerBucket = this.buckets.get("integer") as CofiniteBucket;
        const included = new Set([...integerBucket.included, ...bucket.included]);
        yield { kind: "type", type: "number", excluded: [], included: [...included] };
      } else {
        yield { kind: "type", type, excluded: [...bucket.excluded], included: [...bucket.included] };
      }
    }
  }
}

function cloneBucket(bucket: Bucket): Bucket {
  return bucket.kind === "finite"
    ? { kind: "finite", values: new Set(bucket.values) }
    : { kind: "cofinite", excluded: new Set(bucket.excluded), included: new Set(bucket.included) };
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
