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
      if (!this.values.has(value) && !this.types.has(jsonTypeOf(value))) {
        continue;
      }

      for (const schemaLocation of schemaLocations) {
        this.addValue(value, schemaLocation);
      }
    }

    for (const type of this.types.keys()) {
      if (this.excludedTypes.has(type) || !completionsSet.types.has(type)) {
        this.types.delete(type);
      }
    }

    return this;
  }

  union(completionsSet: CompletionsSet) {
    for (const value of this.excludedValues) {
      if (!completionsSet.excludedValues.has(value)) {
        this.excludedValues.delete(value);
      }
    }

    for (const type of this.excludedTypes) {
      if (!completionsSet.excludedTypes.has(type)) {
        this.excludedTypes.delete(type);
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

      for (const schemaLocation of schemaLocations) {
        this.addType(type, schemaLocation);
      }
    }

    return this;
  }

  symetricDifference(completionsSet: CompletionsSet) {
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
      if (this.types.has(type)) {
        this.excludedTypes.add(type);
      }

      if (this.excludedTypes.has(type)) {
        continue;
      }

      for (const schemaLocation of schemaLocations) {
        this.addType(type, schemaLocation);
      }
    }

    return this;
  }

  negate() {
    const excludedValues = new Set(this.values.keys());
    const values = new Map();
    for (const value of this.excludedValues) {
      values.set(value, []);
    }
    this.values = values;
    this.excludedValues = excludedValues;

    const excludedTypes = new Set(this.types.keys());
    const types = new Map();
    for (const type of this.excludedTypes) {
      types.set(type, []);
    }
    this.types = types;
    this.excludedTypes = excludedTypes;

    return this;
  }

  * [Symbol.iterator]() {
    for (const [value, schemaLocations] of this.values) {
      yield { value, schemaLocations };
    }

    for (const [type, schemaLocations] of this.types) {
      if (type === "integer" && this.types.has("array")) {
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
