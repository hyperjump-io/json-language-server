import * as Pact from "@hyperjump/pact";

export class CompletionsSet {
  private values = new Map<string, string[]>();
  private excludedValues = new Set<string>();
  private types = new Map<string, string[]>();
  private excludedTypes = new Set<string>();

  static fromValues(values: string[], schemaLocation: string) {
    const completionsSet = new CompletionsSet();
    for (const value of values) {
      completionsSet.addValue(value, schemaLocation);
    }

    return completionsSet;
  }

  static fromTypes(types: string[], schemaLocation: string) {
    const completionsSet = new CompletionsSet();
    for (const type of types) {
      switch (type) {
        case "null":
          completionsSet.addValue("null", schemaLocation);
          break;

        case "boolean":
          completionsSet.addValue("true", schemaLocation);
          completionsSet.addValue("false", schemaLocation);
          break;

        default:
          completionsSet.addType(type, schemaLocation);
          if (type === "number") {
            completionsSet.addType("integer", schemaLocation);
          }
      }
    }

    return completionsSet;
  }

  static any() {
    const completionsSet = new CompletionsSet();
    completionsSet.values.set("null", []);
    completionsSet.values.set("true", []);
    completionsSet.values.set("false", []);
    completionsSet.types.set("integer", []);
    completionsSet.types.set("number", []);
    completionsSet.types.set("string", []);
    completionsSet.types.set("array", []);
    completionsSet.types.set("object", []);

    return completionsSet;
  }

  get size() {
    return this.values.size + this.types.size;
  }

  private addValue(value: string, schemaLocation: string) {
    let completionValue = this.values.get(value);

    if (!completionValue) {
      completionValue = [];
      this.values.set(value, completionValue);
    }

    completionValue.push(schemaLocation);
  }

  private addType(type: string, schemaLocation: string) {
    let completionType = this.types.get(type);

    if (!completionType) {
      completionType = [];
      this.types.set(type, completionType);
    }

    completionType.push(schemaLocation);
  }

  intersection(completionsSet: CompletionsSet) {
    for (const value of completionsSet.excludedValues) {
      this.excludedValues.add(value);
    }

    for (const type of completionsSet.excludedTypes) {
      this.excludedTypes.add(type);
    }

    for (const value of this.values.keys()) {
      if (this.excludedValues.has(value)
        || this.excludedTypes.has(jsonTypeOf(value))
        || (!completionsSet.values.has(value) && !completionsSet.types.has(jsonTypeOf(value)))
      ) {
        this.values.delete(value);
      }
    }

    for (const [value, schemaLocations] of completionsSet.values) {
      if (this.excludedValues.has(value) || this.excludedTypes.has(jsonTypeOf(value))) {
        continue;
      }

      if (!this.values.has(value) && !this.types.has(jsonTypeOf(value))) {
        continue;
      }

      for (const schemaLocation of schemaLocations) {
        this.addValue(value, schemaLocation);
      }
    }

    for (const type of this.types.keys()) {
      if (this.excludedTypes.has(type)) {
        this.types.delete(type);
        continue;
      }
      if (completionsSet.types.has(type)) {
        continue;
      }
      if (type === "number" && completionsSet.types.has("integer") && !this.types.has("integer")) {
        this.types.set("integer", this.types.get(type)!);
      }
      this.types.delete(type);
    }

    return this;
  }

  union(completionsSet: CompletionsSet) {
    if (completionsSet.size === 0) {
      return this;
    }

    if (this.size === 0) {
      this.excludedValues = new Set(completionsSet.excludedValues);
      this.excludedTypes = new Set(completionsSet.excludedTypes);
    } else {
      for (const value of this.excludedValues) {
        if (this.offersValue(completionsSet, value)) {
          this.excludedValues.delete(value);
        }
      }

      for (const type of this.excludedTypes) {
        if (this.offersType(completionsSet, type)) {
          this.excludedTypes.delete(type);
        }
      }
    }

    for (const [value, schemaLocations] of completionsSet.values) {
      if (this.excludedValues.has(value) || this.excludedTypes.has(jsonTypeOf(value))) {
        continue;
      }

      if (!this.values.has(value)) {
        this.values.set(value, []);
      }
      for (const schemaLocation of schemaLocations) {
        this.addValue(value, schemaLocation);
      }
    }

    for (const [type, schemaLocations] of completionsSet.types) {
      if (this.excludedTypes.has(type)) {
        continue;
      }
      if (this.types.has("number") && type === "integer") {
        continue;
      }

      if (!this.types.has(type)) {
        this.types.set(type, []);
      }
      for (const schemaLocation of schemaLocations) {
        this.addType(type, schemaLocation);
      }
    }

    if (this.types.has("number") && this.types.has("integer")) {
      this.types.delete("integer");
    }

    return this;
  }

  symmetricDifference(completionsSet: CompletionsSet) {
    for (const [value, schemaLocations] of completionsSet.values) {
      if (this.values.has(value)) {
        this.excludedValues.add(value);
        this.values.delete(value);
      }

      if (this.excludedValues.has(value) || this.excludedTypes.has(jsonTypeOf(value))) {
        continue;
      }

      for (const schemaLocation of schemaLocations) {
        this.addValue(value, schemaLocation);
      }
    }

    for (const [type, schemaLocations] of completionsSet.types) {
      if (type === "integer" && this.types.has("number")) {
        continue;
      }

      if (type === "number" && this.types.has("integer")) {
        this.types.delete("integer");
      }

      if (this.types.has(type)) {
        this.excludedTypes.add(type);
      }

      if (this.excludedTypes.has(type)) {
        continue;
      }

      if (!this.types.has(type)) {
        this.types.set(type, []);
      }
      for (const schemaLocation of schemaLocations) {
        this.addType(type, schemaLocation);
      }
    }

    return this;
  }

  negate() {
    const any = CompletionsSet.any();

    for (const value of this.values.keys()) {
      any.excludedValues.add(value);
      any.values.delete(value);
    }

    for (const type of this.types.keys()) {
      any.excludedTypes.add(type);
      any.types.delete(type);
    }

    for (const value of this.excludedValues) {
      any.excludedValues.delete(value);
    }

    for (const type of this.excludedTypes) {
      any.excludedTypes.delete(type);
    }

    this.values = any.values;
    this.excludedValues = any.excludedValues;
    this.types = any.types;
    this.excludedTypes = any.excludedTypes;

    return this;
  }

  private offersValue(completionsSet: CompletionsSet, value: string) {
    return !completionsSet.excludedValues.has(value)
      && !completionsSet.excludedTypes.has(jsonTypeOf(value))
      && (completionsSet.values.has(value) || completionsSet.types.has(jsonTypeOf(value)));
  }

  private offersType(completionsSet: CompletionsSet, type: string): boolean {
    return !completionsSet.excludedTypes.has(type)
      && (completionsSet.types.has(type)
        || (type === "integer" && completionsSet.types.has("number"))
        || Pact.some((value) => jsonTypeOf(value) === type, completionsSet.values.keys()));
  }

  * [Symbol.iterator]() {
    for (const [value, schemaLocations] of this.values) {
      yield { value, schemaLocations };
    }

    for (const [type, schemaLocations] of this.types) {
      if (type === "integer" && this.types.has("number")) {
        continue;
      }
      yield { type, schemaLocations };
    }
  }
}

const jsonTypeOf = (json: string) => {
  switch (json.charAt(0)) {
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
    default:
      if (/^\d+$/.test(json)) {
        return "integer";
      } else {
        return "number";
      }
  }
};
