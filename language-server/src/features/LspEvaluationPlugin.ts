import { getKeyword } from "@hyperjump/json-schema/experimental";
import * as Instance from "@hyperjump/json-schema/instance/experimental";
import * as JsonPointer from "@hyperjump/json-pointer";
import * as Pact from "@hyperjump/pact";
import { JsonValueSet } from "./JsonValueSet.ts";
import { SubschemaTracker } from "./SubschemaTracker.ts";
import { Annotation } from "../annotations/Annotation.ts";

import type { EvaluationPlugin, Keyword, Node, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { JsonSchemaType, TypeEntry, ValueEntry } from "./JsonValueSet.ts";
import type { AnnotationRecord } from "../annotations/JsonSchemaAnnotation.ts";
import type { SchemaEvaluation } from "../services/JsonSchema.ts";

// A location annotation applies no matter what the value at the location is.
// A value annotation applies only because of what the value is, such as an
// annotation from an anyOf alternative.
type RecordedAnnotation = { kind: "location" | "value"; annotation: AnnotationRecord };
type RecordedAnnotations = Record<string, RecordedAnnotation[]>;

type Completions = Record<string, JsonValueSet>;

export type Completion = WithAnnotations<ValueEntry> | WithAnnotations<TypeEntry>;
type WithAnnotations<T extends { annotations: AnnotationRecord[] }> = Omit<T, "annotations"> & { annotations: Annotation[] };

type SchemaResult = {
  pointer: string;
  annotations: RecordedAnnotations;
  completions: Completions;
};

type LspContext = ValidationContext & {
  pendingAnnotations?: AnnotationRecord;
  schemaAnnotations?: RecordedAnnotations;
  completions?: Completions;
  dynamicAnchors?: Record<string, string>;
  evaluatedProperties?: Set<string>;
  schemaEvaluatedProperties?: Set<string>;
  evaluatedItems?: Set<number>;
  schemaEvaluatedItems?: Set<number>;
};

// Collects what the language server needs to know about each instance
// location: the annotations that apply to the value that's there and the
// values that could be there.
export class LspEvaluationPlugin implements EvaluationPlugin<LspContext> {
  static readonly id = "lsp";

  private annotations: RecordedAnnotations = Object.create(null);
  private completions: Completions = Object.create(null);
  private incompleteLocations: Set<string>;
  private subschemaTracker = new SubschemaTracker<SchemaResult>();

  constructor(incompleteLocations: Set<string> = new Set()) {
    this.incompleteLocations = incompleteLocations;
  }

  // The plugin is registered once, in build-server.ts
  static from(result: SchemaEvaluation): LspEvaluationPlugin {
    const plugin = result.plugins.get(LspEvaluationPlugin.id);
    if (!plugin) {
      throw Error(`The ${LspEvaluationPlugin.id} evaluation plugin isn't registered`);
    }
    return plugin as LspEvaluationPlugin;
  }

  beforeSchema(_url: string, _instance: JsonNode, context: LspContext): void {
    context.pendingAnnotations = {};
    context.schemaAnnotations = Object.create(null);
    context.completions = Object.create(null);
    this.subschemaTracker.beforeSchema(context);
  }

  beforeKeyword(keywordNode: Node<unknown>, instance: JsonNode, context: LspContext, schemaContext: LspContext): void {
    const [keywordId, , keywordValue] = keywordNode;

    this.subschemaTracker.beforeKeyword(context);

    switch (keywordId) {
      case "https://json-schema.org/keyword/properties": {
        const properties = keywordValue as Record<string, string>;
        for (const propertyName in properties) {
          const pointer = JsonPointer.append(propertyName, instance.pointer);
          const schemaUri = properties[propertyName];
          const completions = this.buildCompletions(schemaUri, schemaContext);
          schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

          if (this.incompleteLocations.has(pointer)) {
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/patternProperties": {
        const patternProperties = keywordValue as [RegExp, string][];
        for (const [pattern, schemaUri] of patternProperties) {
          const completions = this.buildCompletions(schemaUri, schemaContext);
          for (const propertyNameNode of Instance.keys(instance)) {
            const propertyName = Instance.value(propertyNameNode) as string;
            if (pattern.test(propertyName)) {
              const pointer = JsonPointer.append(propertyName, instance.pointer);
              schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
            }
          }

          for (const pointer of this.incompleteLocations) {
            const [parentPointer, propertyName] = splitPointer(pointer);
            if (parentPointer === instance.pointer && pattern.test(propertyName)) {
              schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
              context.evaluatedProperties?.add(propertyName);
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/additionalProperties": {
        const [isDeclaredProperty, schemaUri] = keywordValue as [RegExp, string];
        const completions = this.buildCompletions(schemaUri, schemaContext);
        for (const propertyNameNode of Instance.keys(instance)) {
          const propertyName = Instance.value(propertyNameNode) as string;
          if (!isDeclaredProperty.test(propertyName)) {
            const pointer = JsonPointer.append(propertyName, instance.pointer);
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
          }
        }

        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !isDeclaredProperty.test(propertyName)) {
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedProperties": {
        const schemaUri = keywordValue as string;
        const completions = this.buildCompletions(schemaUri, schemaContext);
        for (const propertyNameNode of Instance.keys(instance)) {
          const propertyName = Instance.value(propertyNameNode) as string;
          if (!context.schemaEvaluatedProperties!.has(propertyName)) {
            const pointer = JsonPointer.append(propertyName, instance.pointer);
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
          }
        }

        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !context.schemaEvaluatedProperties!.has(propertyName)) {
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/prefixItems": {
        const prefixItems = keywordValue as string[];
        for (let itemIndex = 0; itemIndex < prefixItems.length; itemIndex++) {
          const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
          const completions = this.buildCompletions(prefixItems[itemIndex], schemaContext);
          schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

          if (this.incompleteLocations.has(pointer)) {
            context.evaluatedItems?.add(Number(itemIndex));
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/draft-04/additionalItems":
      case "https://json-schema.org/keyword/items": {
        const [numberOfPrefixItems, schemaUri] = keywordValue as [number, string];
        const completions = this.buildCompletions(schemaUri, schemaContext);
        for (let itemIndex = numberOfPrefixItems; itemIndex <= Instance.length(instance); itemIndex++) {
          const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
          schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

          if (this.incompleteLocations.has(pointer)) {
            context.evaluatedItems?.add(Number(itemIndex));
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/draft-04/items": {
        if (typeof keywordValue === "string") {
          const completions = this.buildCompletions(keywordValue, schemaContext);
          for (let itemIndex = 0; itemIndex <= Instance.length(instance); itemIndex++) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

            if (this.incompleteLocations.has(pointer)) {
              context.evaluatedItems?.add(Number(itemIndex));
            }
          }
        } else {
          const items = keywordValue as string[];
          for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            const completions = this.buildCompletions(items[itemIndex], schemaContext);
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

            if (this.incompleteLocations.has(pointer)) {
              context.evaluatedItems?.add(Number(itemIndex));
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedItems": {
        const schemaUri = keywordValue as string;
        const completions = this.buildCompletions(schemaUri, schemaContext);
        for (let itemIndex = 0; itemIndex <= Instance.length(instance); itemIndex++) {
          if (!context.schemaEvaluatedItems!.has(itemIndex)) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            schemaContext.completions![pointer] = schemaContext.completions![pointer]?.intersect(completions) ?? completions;

            if (this.incompleteLocations.has(pointer)) {
              context.evaluatedItems?.add(itemIndex);
            }
          }
        }
        break;
      }
    }
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: LspContext, valid: boolean, schemaContext: LspContext, keyword: Keyword<unknown>): void {
    const [keywordId, , keywordValue] = node;

    this.subschemaTracker.afterKeyword(instance, context, valid, schemaContext);

    if (keyword.annotation) {
      schemaContext.pendingAnnotations ??= {};
      schemaContext.pendingAnnotations[keywordId] = keyword.annotation(keywordValue, instance, context);
    }

    const subschemaResults = this.subschemaTracker.getSubschemaResults(context);
    const subschemaValues = subschemaResults.map((result) => result.value);
    const discriminatedValues = keywordId === "https://json-schema.org/keyword/anyOf" || keywordId === "https://json-schema.org/keyword/oneOf"
      ? this.subschemaTracker.discriminate(subschemaResults, instance)
      : subschemaValues;

    // Annotations are retained for failing subschemas because the instance is
    // usually invalid while it's being edited. Only anyOf/oneOf alternatives
    // that are ruled out by a discriminating location are dropped.
    let annotationValues: SchemaResult[];
    switch (keywordId) {
      case "https://json-schema.org/keyword/not":
        // Annotations describe the instances a schema matches, so none of
        // them apply when it's negated
        annotationValues = [];
        break;

      default:
        annotationValues = discriminatedValues;
    }

    const isConditional = conditionalKeywords.has(keywordId);
    for (const { pointer, annotations } of annotationValues) {
      appendAnnotations(schemaContext.schemaAnnotations!, isConditional ? asValueAnnotations(annotations, pointer) : annotations);
    }

    let combinedCompletions: Completions = Object.create(null);
    switch (keywordId) {
      case "https://json-schema.org/keyword/anyOf": {
        for (const { completions } of discriminatedValues) {
          combinedCompletions = this.union(combinedCompletions, completions);
        }
        break;
      }

      case "https://json-schema.org/keyword/oneOf": {
        combinedCompletions = this.exclusiveUnion(discriminatedValues.map(({ completions }) => completions));
        break;
      }

      case "https://json-schema.org/keyword/if":
        break;

      case "https://json-schema.org/keyword/not": {
        for (const { completions } of subschemaValues) {
          combinedCompletions = this.negate(combinedCompletions, completions);
        }
        break;
      }

      default:
        for (const { completions } of subschemaValues) {
          combinedCompletions = this.intersection(combinedCompletions, completions);
        }
    }

    schemaContext.completions = this.intersection(schemaContext.completions!, combinedCompletions);
  }

  afterSchema(_url: string, instance: JsonNode, context: LspContext, valid: boolean): void {
    // A schema's own annotations are kept even if it fails so they're still
    // available while the value is being edited
    if (context.pendingAnnotations) {
      appendAnnotations(context.schemaAnnotations!, {
        [instance.pointer]: [{ kind: "location", annotation: context.pendingAnnotations }]
      });
    }

    this.subschemaTracker.afterSchema(instance, context, valid, {
      pointer: instance.pointer,
      annotations: context.schemaAnnotations!,
      completions: context.completions!
    });

    this.annotations = context.schemaAnnotations!;
    this.completions = context.completions!;
  }

  // Locations that evaluation reached have the annotations collected while
  // evaluating their value. Locations without a value, such as incomplete
  // properties or properties declared by the schema that aren't in the
  // instance, have the annotations of the values that could be there.

  // All annotations at a location, both location and value annotations
  getAnnotations(instanceLocation: string): Annotation[] {
    if (instanceLocation in this.annotations) {
      return toAnnotations(this.annotations[instanceLocation].map(({ annotation }) => annotation));
    }

    return [...this.getLocationAnnotations(instanceLocation), ...this.getValueAnnotations(instanceLocation)];
  }

  // The annotations that apply no matter what the value at the location is.
  // These describe the property or item rather than its value.
  getLocationAnnotations(instanceLocation: string): Annotation[] {
    if (instanceLocation in this.annotations) {
      return toAnnotations(this.getAnnotationsOfKind(instanceLocation, "location"));
    }

    return toAnnotations(this.completions[instanceLocation]?.getLocationAnnotations() ?? []);
  }

  // The annotations that apply because of what the value at the location is.
  // For example, the annotations of an anyOf alternative.
  getValueAnnotations(instanceLocation: string): Annotation[] {
    if (instanceLocation in this.annotations) {
      return toAnnotations(this.getAnnotationsOfKind(instanceLocation, "value"));
    }

    return toAnnotations(this.completions[instanceLocation]?.getMemberAnnotations() ?? []);
  }

  private getAnnotationsOfKind(instanceLocation: string, kind: RecordedAnnotation["kind"]): AnnotationRecord[] {
    return Pact.pipe(
      this.annotations[instanceLocation],
      Pact.filter((recorded) => recorded.kind === kind),
      Pact.map(({ annotation }) => annotation),
      Pact.collectArray
    );
  }

  * getCompletions(pointer: string): Generator<Completion> {
    const valueSet = this.completions[pointer] ?? new JsonValueSet();
    for (const completion of valueSet) {
      if (completion.kind === "value") {
        yield { ...completion, annotations: toAnnotations(completion.annotations) };
      } else {
        for (const value of completion.included) {
          yield { kind: "value", value, annotations: toAnnotations(valueSet.getValueAnnotations(value)) };
        }

        yield { ...completion, annotations: toAnnotations(completion.annotations) };
      }
    }
  }

  getPropertyCompletions(pointer: string) {
    const propertyNames: string[] = [];

    for (const completionPointer in this.completions) {
      const [parentPointer, propertyName] = splitPointer(completionPointer);
      if (parentPointer !== pointer) {
        continue;
      }

      if (!this.completions[completionPointer].isEmpty()) {
        propertyNames.push(propertyName);
      }
    }

    return propertyNames;
  }

  // The values that could be at a location and their annotations, built from
  // the schema without an instance. `inProgress` holds the schemas currently
  // being expanded so a schema that references itself in-place doesn't recurse
  // forever. A cycle adds no information, so it's treated as unconstrained.
  // $dynamicRef is resolved using the dynamic scope of the parent, so it's an
  // approximation.
  private buildCompletions(schemaLocation: string, context: LspContext, inProgress: Set<string> = new Set()): JsonValueSet {
    if (inProgress.has(schemaLocation)) {
      return JsonValueSet.any();
    }

    const nodes = context.ast[schemaLocation];

    if (nodes === true) {
      return JsonValueSet.any();
    }

    if (nodes === false) {
      return new JsonValueSet();
    }

    inProgress.add(schemaLocation);

    const completions = Pact.pipe(
      nodes,
      Pact.map((node) => {
        const [keywordId, , keywordValue] = node;

        switch (keywordId) {
          case "https://json-schema.org/keyword/const":
            return new JsonValueSet().addValue(keywordValue as string);

          case "https://json-schema.org/keyword/enum":
            return (keywordValue as string[]).reduce((set, value) => set.addValue(value), new JsonValueSet());

          case "https://json-schema.org/keyword/type": {
            const types = Array.isArray(keywordValue) ? keywordValue : [keywordValue];
            return (types as JsonSchemaType[]).reduce((set, type) => set.addType(type), new JsonValueSet());
          }

          case "https://json-schema.org/keyword/ref":
            return this.buildCompletions(keywordValue as string, context, inProgress);

          case "https://json-schema.org/keyword/dynamicRef":
            return this.buildCompletions(context.dynamicAnchors![keywordValue as string], context, inProgress);

          case "https://json-schema.org/keyword/draft-2020-12/dynamicRef": {
            const [, fragment, ref] = keywordValue as [string, string, string];
            return this.buildCompletions(context.dynamicAnchors![fragment] ?? ref, context, inProgress);
          }

          case "https://json-schema.org/keyword/allOf":
            return (keywordValue as string[]).reduce((valueSet, subSchemaLocation) => {
              return valueSet.intersect(this.buildCompletions(subSchemaLocation, context, inProgress));
            }, JsonValueSet.any());

          case "https://json-schema.org/keyword/anyOf":
            return (keywordValue as string[]).reduce((valueSet, subSchemaLocation) => {
              return valueSet.union(this.buildCompletions(subSchemaLocation, context, inProgress).withMemberAnnotations());
            }, new JsonValueSet());

          case "https://json-schema.org/keyword/oneOf":
            return JsonValueSet.exclusiveUnion(
              (keywordValue as string[]).map((subSchemaLocation) => {
                return this.buildCompletions(subSchemaLocation, context, inProgress).withMemberAnnotations();
              })
            );

          case "https://json-schema.org/keyword/not":
            return this.buildCompletions(keywordValue as string, context, inProgress).complement();

          default:
            return JsonValueSet.any();
        }
      }),
      Pact.reduce((valueSet, keywordValueSet) => valueSet.intersect(keywordValueSet), JsonValueSet.any())
    );

    const annotation: AnnotationRecord = {};
    for (const node of nodes) {
      addKeywordAnnotation(annotation, node, context);
    }

    if (Object.keys(annotation).length > 0) {
      completions.annotate(annotation);
    }

    inProgress.delete(schemaLocation);

    return completions;
  }

  private intersection(a: Completions, b: Completions): Completions {
    const result: Completions = Object.create(null);
    for (const instanceLocation in a) {
      result[instanceLocation] = a[instanceLocation];
    }
    for (const instanceLocation in b) {
      result[instanceLocation] = result[instanceLocation] ? result[instanceLocation].intersect(b[instanceLocation]) : b[instanceLocation];
    }
    return result;
  }

  private union(a: Completions, b: Completions): Completions {
    const result: Completions = Object.create(null);
    for (const instanceLocation in a) {
      result[instanceLocation] = a[instanceLocation];
    }
    for (const instanceLocation in b) {
      result[instanceLocation] = result[instanceLocation] ? result[instanceLocation].union(b[instanceLocation]) : b[instanceLocation];
    }
    return result;
  }

  private negate(a: Completions, b: Completions): Completions {
    const result: Completions = Object.create(null);
    for (const instanceLocation in a) {
      result[instanceLocation] = a[instanceLocation];
    }
    for (const instanceLocation in b) {
      const negated = b[instanceLocation].complement();
      result[instanceLocation] = result[instanceLocation] ? result[instanceLocation].union(negated) : negated;
    }
    return result;
  }

  private exclusiveUnion(records: Completions[]): Completions {
    const pointers = new Set<string>();
    for (const record of records) {
      for (const pointer in record) {
        pointers.add(pointer);
      }
    }

    const result: Completions = Object.create(null);
    for (const pointer of pointers) {
      result[pointer] = Pact.pipe(
        records,
        Pact.map((record) => record[pointer]),
        Pact.filter((set) => set !== undefined),
        Pact.collectArray,
        (sets) => JsonValueSet.exclusiveUnion(sets)
      );
    }

    return result;
  }
}

// Keywords whose subschemas apply to the instance location only because of
// what the value is. Annotations at that location from these subschemas are
// value annotations. Annotations at other locations, such as properties, aren't
// affected because a condition on an object doesn't depend on the values of its
// properties.
const conditionalKeywords = new Set([
  "https://json-schema.org/keyword/anyOf",
  "https://json-schema.org/keyword/oneOf",
  "https://json-schema.org/keyword/if",
  "https://json-schema.org/keyword/then",
  "https://json-schema.org/keyword/else",
  "https://json-schema.org/keyword/dependentSchemas",
  "https://json-schema.org/keyword/draft-04/dependencies",
  "https://json-schema.org/keyword/propertyDependencies",
  "https://json-schema.org/keyword/contains",
  "https://json-schema.org/keyword/draft-06/contains"
]);

function asValueAnnotations(annotations: RecordedAnnotations, pointer: string): RecordedAnnotations {
  if (!(pointer in annotations)) {
    return annotations;
  }

  return {
    ...annotations,
    [pointer]: annotations[pointer].map(({ annotation }) => ({ kind: "value", annotation }))
  };
}

// Adds a keyword's annotation without an instance, for locations that
// evaluation doesn't reach.
function addKeywordAnnotation(annotation: AnnotationRecord, [keywordId, , keywordValue]: Node<unknown>, context: ValidationContext) {
  const keyword = getKeyword(keywordId);
  if (keyword?.annotation) {
    try {
      annotation[keywordId] = keyword.annotation(keywordValue, undefined as unknown as JsonNode, context);
    } catch {
      // Some annotation functions expect a real instance node; skip rather than crash.
    }
  }
}

function toAnnotations(records: AnnotationRecord[]): Annotation[] {
  return records.map((record) => new Annotation(record));
}

function appendAnnotations(target: RecordedAnnotations, source: RecordedAnnotations) {
  for (const pointer in source) {
    target[pointer] ??= [];
    target[pointer].push(...source[pointer]);
  }
}

function splitPointer(pointer: string): [string, string] {
  const lastSlash = pointer.lastIndexOf("/");
  const propertyName = pointer.slice(lastSlash + 1)
    .replace(/~1/g, "/")
    .replace(/~0/g, "~");
  return [pointer.slice(0, lastSlash), propertyName];
}
