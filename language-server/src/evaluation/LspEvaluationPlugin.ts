import { getKeyword } from "@hyperjump/json-schema/experimental";
import * as Instance from "@hyperjump/json-schema/instance/experimental";
import * as JsonPointer from "@hyperjump/json-pointer";
import { JsonValueSet } from "./JsonValueSet.ts";
import { SubschemaTracker } from "./SubschemaTracker.ts";
import { Annotation } from "./Annotation.ts";

import type { EvaluationPlugin, Keyword, Node, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { JsonSchemaType, TypeEntry, ValueEntry } from "./JsonValueSet.ts";
import type { AnnotationRecord } from "./Annotation.ts";
import type { SchemaEvaluation } from "../services/JsonSchema.ts";

// A location annotation applies no matter what the value at the location is.
// A value annotation applies only because of what the value is, such as an
// annotation from an anyOf alternative.
type RecordedAnnotation = { kind: "location" | "value"; annotation: AnnotationRecord };
type RecordedAnnotations = Record<string, RecordedAnnotation[]>;

// Value sets are built only when something asks for the completions or
// annotations at a location, and only once
type LazyValueSet = () => JsonValueSet;
type Completions = Record<string, LazyValueSet>;

export type Completion = WithAnnotations<ValueEntry> | WithAnnotations<TypeEntry>;
type WithAnnotations<T extends { annotations: AnnotationRecord[] }> = Omit<T, "annotations"> & { annotations: Annotation[] };

type OwnAnnotations = {
  annotation: AnnotationRecord;
  firstAnnotationNode: Node<unknown> | undefined;
};

type SchemaResult = {
  pointer: string;
  annotations: RecordedAnnotations;
  completions: Completions;
};

type LspContext = ValidationContext & {
  schemaLocation?: string;
  ownAnnotations?: AnnotationRecord;
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
  // Incomplete locations by the pointer of their parent so the keywords that
  // apply to an object only look at its own incomplete properties
  private incompleteChildren = new Map<string, [string, string][]>();
  private subschemaTracker = new SubschemaTracker<SchemaResult>();

  // A schema that's applied more than once to the same value, such as one
  // that's referenced twice, contributes the same annotations every time. Each
  // schema has one record so its annotations are only used once. They're keyed
  // by instance location and then schema location. Completions are built
  // without an instance, so they're keyed only by schema location.
  private ownAnnotationRecords: Record<string, Record<string, AnnotationRecord>> = Object.create(null);
  private completionAnnotations = new Map<string, OwnAnnotations>();

  constructor(incompleteLocations: Set<string> = new Set()) {
    this.incompleteLocations = incompleteLocations;
    for (const pointer of incompleteLocations) {
      const [parentPointer, propertyName] = splitPointer(pointer);
      let children = this.incompleteChildren.get(parentPointer);
      if (!children) {
        children = [];
        this.incompleteChildren.set(parentPointer, children);
      }
      children.push([pointer, propertyName]);
    }
  }

  // The plugin is registered once, in build-server.ts
  static from(result: SchemaEvaluation): LspEvaluationPlugin {
    const plugin = result.plugins.get(LspEvaluationPlugin.id);
    if (!plugin) {
      throw Error(`The ${LspEvaluationPlugin.id} evaluation plugin isn't registered`);
    }
    return plugin as LspEvaluationPlugin;
  }

  beforeSchema(url: string, _instance: JsonNode, context: LspContext): void {
    context.schemaLocation = url;
    context.ownAnnotations = undefined;
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
          const completions = this.lazyCompletions(schemaUri, schemaContext);
          addCompletions(schemaContext.completions!, pointer, completions);

          if (this.incompleteLocations.has(pointer)) {
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/patternProperties": {
        const patternProperties = keywordValue as [RegExp, string][];
        for (const [pattern, schemaUri] of patternProperties) {
          const completions = this.lazyCompletions(schemaUri, schemaContext);
          for (const propertyNameNode of Instance.keys(instance)) {
            const propertyName = Instance.value(propertyNameNode) as string;
            if (pattern.test(propertyName)) {
              const pointer = JsonPointer.append(propertyName, instance.pointer);
              addCompletions(schemaContext.completions!, pointer, completions);
            }
          }

          for (const [pointer, propertyName] of this.incompleteChildren.get(instance.pointer) ?? []) {
            if (pattern.test(propertyName)) {
              addCompletions(schemaContext.completions!, pointer, completions);
              context.evaluatedProperties?.add(propertyName);
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/additionalProperties": {
        const [isDeclaredProperty, schemaUri] = keywordValue as [RegExp, string];
        const completions = this.lazyCompletions(schemaUri, schemaContext);
        for (const propertyNameNode of Instance.keys(instance)) {
          const propertyName = Instance.value(propertyNameNode) as string;
          if (!isDeclaredProperty.test(propertyName)) {
            const pointer = JsonPointer.append(propertyName, instance.pointer);
            addCompletions(schemaContext.completions!, pointer, completions);
          }
        }

        for (const [pointer, propertyName] of this.incompleteChildren.get(instance.pointer) ?? []) {
          if (!isDeclaredProperty.test(propertyName)) {
            addCompletions(schemaContext.completions!, pointer, completions);
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedProperties": {
        const schemaUri = keywordValue as string;
        const completions = this.lazyCompletions(schemaUri, schemaContext);
        for (const propertyNameNode of Instance.keys(instance)) {
          const propertyName = Instance.value(propertyNameNode) as string;
          if (!context.schemaEvaluatedProperties!.has(propertyName)) {
            const pointer = JsonPointer.append(propertyName, instance.pointer);
            addCompletions(schemaContext.completions!, pointer, completions);
          }
        }

        for (const [pointer, propertyName] of this.incompleteChildren.get(instance.pointer) ?? []) {
          if (!context.schemaEvaluatedProperties!.has(propertyName)) {
            addCompletions(schemaContext.completions!, pointer, completions);
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/prefixItems": {
        const prefixItems = keywordValue as string[];
        for (let itemIndex = 0; itemIndex < prefixItems.length; itemIndex++) {
          const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
          const completions = this.lazyCompletions(prefixItems[itemIndex], schemaContext);
          addCompletions(schemaContext.completions!, pointer, completions);

          if (this.incompleteLocations.has(pointer)) {
            context.evaluatedItems?.add(Number(itemIndex));
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/draft-04/additionalItems":
      case "https://json-schema.org/keyword/items": {
        const [numberOfPrefixItems, schemaUri] = keywordValue as [number, string];
        const completions = this.lazyCompletions(schemaUri, schemaContext);
        for (let itemIndex = numberOfPrefixItems; itemIndex <= Instance.length(instance); itemIndex++) {
          const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
          addCompletions(schemaContext.completions!, pointer, completions);

          if (this.incompleteLocations.has(pointer)) {
            context.evaluatedItems?.add(Number(itemIndex));
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/draft-04/items": {
        if (typeof keywordValue === "string") {
          const completions = this.lazyCompletions(keywordValue, schemaContext);
          for (let itemIndex = 0; itemIndex <= Instance.length(instance); itemIndex++) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            addCompletions(schemaContext.completions!, pointer, completions);

            if (this.incompleteLocations.has(pointer)) {
              context.evaluatedItems?.add(Number(itemIndex));
            }
          }
        } else {
          const items = keywordValue as string[];
          for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            const completions = this.lazyCompletions(items[itemIndex], schemaContext);
            addCompletions(schemaContext.completions!, pointer, completions);

            if (this.incompleteLocations.has(pointer)) {
              context.evaluatedItems?.add(Number(itemIndex));
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedItems": {
        const schemaUri = keywordValue as string;
        const completions = this.lazyCompletions(schemaUri, schemaContext);
        for (let itemIndex = 0; itemIndex <= Instance.length(instance); itemIndex++) {
          if (!context.schemaEvaluatedItems!.has(itemIndex)) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            addCompletions(schemaContext.completions!, pointer, completions);

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

    this.subschemaTracker.afterKeyword(keywordId, keywordValue, instance, context, valid, schemaContext);

    // A schema's own annotations are recorded where its first annotation
    // keyword is so annotations are in the order they appear in the schema.
    // They're kept even if the schema fails so they're still available while
    // the value is being edited.
    if (keyword.annotation) {
      if (!schemaContext.ownAnnotations) {
        this.ownAnnotationRecords[instance.pointer] ??= Object.create(null);
        schemaContext.ownAnnotations = this.ownAnnotationRecords[instance.pointer][schemaContext.schemaLocation!] ??= {};
        appendAnnotations(schemaContext.schemaAnnotations!, {
          [instance.pointer]: [{ kind: "location", annotation: schemaContext.ownAnnotations }]
        });
      }
      schemaContext.ownAnnotations[keywordId] = keyword.annotation(keywordValue, instance, context);
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
      appendAnnotations(schemaContext.schemaAnnotations!, annotations, isConditional ? pointer : undefined);
    }

    // The schema's completions are only shared once the schema is done, so
    // they're combined in place rather than copied for every keyword
    switch (keywordId) {
      case "https://json-schema.org/keyword/anyOf": {
        const combinedCompletions: Completions = Object.create(null);
        for (const { completions } of discriminatedValues) {
          unionInto(combinedCompletions, completions);
        }
        intersectInto(schemaContext.completions!, combinedCompletions);
        break;
      }

      case "https://json-schema.org/keyword/oneOf": {
        intersectInto(schemaContext.completions!, exclusiveUnion(discriminatedValues.map(({ completions }) => completions)));
        break;
      }

      case "https://json-schema.org/keyword/if":
        break;

      case "https://json-schema.org/keyword/not": {
        const combinedCompletions: Completions = Object.create(null);
        for (const { completions } of subschemaValues) {
          negateInto(combinedCompletions, completions);
        }
        intersectInto(schemaContext.completions!, combinedCompletions);
        break;
      }

      default:
        for (const { completions } of subschemaValues) {
          intersectInto(schemaContext.completions!, completions);
        }
    }
  }

  afterSchema(_url: string, instance: JsonNode, context: LspContext, valid: boolean): void {
    // Marks the location as reached by evaluation even if it has no annotations
    context.schemaAnnotations![instance.pointer] ??= [];

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

    return toAnnotations(this.completions[instanceLocation]?.().getLocationAnnotations() ?? []);
  }

  // The annotations that apply because of what the value at the location is.
  // For example, the annotations of an anyOf alternative.
  getValueAnnotations(instanceLocation: string): Annotation[] {
    if (instanceLocation in this.annotations) {
      return toAnnotations(this.getAnnotationsOfKind(instanceLocation, "value"));
    }

    return toAnnotations(this.completions[instanceLocation]?.().getMemberAnnotations() ?? []);
  }

  private getAnnotationsOfKind(instanceLocation: string, kind: RecordedAnnotation["kind"]): AnnotationRecord[] {
    const annotations: AnnotationRecord[] = [];
    for (const recorded of this.annotations[instanceLocation]) {
      if (recorded.kind === kind) {
        annotations.push(recorded.annotation);
      }
    }
    return annotations;
  }

  * getCompletions(pointer: string): Generator<Completion> {
    const valueSet = this.completions[pointer]?.() ?? new JsonValueSet();
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

      if (!this.completions[completionPointer]().isEmpty()) {
        propertyNames.push(propertyName);
      }
    }

    return propertyNames;
  }

  // The context changes as evaluation continues, so the parts building needs
  // are captured now
  private lazyCompletions(schemaLocation: string, context: LspContext): LazyValueSet {
    const buildContext = { ...context };
    return lazy(() => this.buildCompletions(schemaLocation, buildContext));
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

    // The schema's own annotations go where its first annotation keyword is so
    // annotations are in the order they appear in the schema
    const { annotation, firstAnnotationNode } = this.buildOwnAnnotations(schemaLocation, nodes, context);

    // Most keywords don't constrain the value, so they're skipped rather than
    // intersected as an unconstrained set. Every intersection creates a new set,
    // so annotating the result in place doesn't affect any other set.
    let completions: JsonValueSet | undefined;
    for (const node of nodes) {
      const keywordValueSet = this.buildKeywordCompletions(node, context, inProgress);
      if (keywordValueSet) {
        completions = completions?.intersect(keywordValueSet) ?? keywordValueSet;
      } else if (node === firstAnnotationNode) {
        completions = (completions ?? JsonValueSet.any()).annotate(annotation);
      }
    }

    inProgress.delete(schemaLocation);

    return completions ?? JsonValueSet.any();
  }

  private buildOwnAnnotations(schemaLocation: string, nodes: Node<unknown>[], context: LspContext): OwnAnnotations {
    let ownAnnotations = this.completionAnnotations.get(schemaLocation);
    if (!ownAnnotations) {
      ownAnnotations = { annotation: {}, firstAnnotationNode: undefined };
      for (const node of nodes) {
        if (addKeywordAnnotation(ownAnnotations.annotation, node, context)) {
          ownAnnotations.firstAnnotationNode ??= node;
        }
      }
      this.completionAnnotations.set(schemaLocation, ownAnnotations);
    }

    return ownAnnotations;
  }

  // Undefined if the keyword doesn't constrain the value
  private buildKeywordCompletions([keywordId, , keywordValue]: Node<unknown>, context: LspContext, inProgress: Set<string>): JsonValueSet | undefined {
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
        // The meta-schema requires at least one subschema
        return (keywordValue as string[])
          .map((subSchemaLocation) => this.buildCompletions(subSchemaLocation, context, inProgress))
          .reduce((valueSet, subSchemaValueSet) => valueSet.intersect(subSchemaValueSet));

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
    }
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

const lazy = (build: () => JsonValueSet): LazyValueSet => {
  let valueSet: JsonValueSet | undefined;
  return () => valueSet ??= build();
};

const lazyIntersect = (a: LazyValueSet, b: LazyValueSet): LazyValueSet => lazy(() => a().intersect(b()));

function addCompletions(completions: Completions, pointer: string, valueSet: LazyValueSet) {
  completions[pointer] = completions[pointer] ? lazyIntersect(completions[pointer], valueSet) : valueSet;
}

function intersectInto(target: Completions, source: Completions) {
  for (const pointer in source) {
    addCompletions(target, pointer, source[pointer]);
  }
}

function unionInto(target: Completions, source: Completions) {
  for (const pointer in source) {
    const existing = target[pointer];
    const other = source[pointer];
    target[pointer] = existing ? lazy(() => existing().union(other())) : other;
  }
}

function negateInto(target: Completions, source: Completions) {
  for (const pointer in source) {
    const existing = target[pointer];
    const other = source[pointer];
    target[pointer] = existing
      ? lazy(() => existing().union(other().complement()))
      : lazy(() => other().complement());
  }
}

function exclusiveUnion(records: Completions[]): Completions {
  const setsByPointer: Record<string, LazyValueSet[]> = Object.create(null);
  for (const record of records) {
    for (const pointer in record) {
      setsByPointer[pointer] ??= [];
      setsByPointer[pointer].push(record[pointer]);
    }
  }

  const result: Completions = Object.create(null);
  for (const pointer in setsByPointer) {
    const sets = setsByPointer[pointer];
    result[pointer] = lazy(() => JsonValueSet.exclusiveUnion(sets.map((set) => set())));
  }

  return result;
}

// Adds a keyword's annotation without an instance, for locations that
// evaluation doesn't reach.
// Returns whether the keyword contributed an annotation
function addKeywordAnnotation(annotation: AnnotationRecord, [keywordId, , keywordValue]: Node<unknown>, context: ValidationContext): boolean {
  const keyword = getKeyword(keywordId);
  if (keyword?.annotation) {
    try {
      annotation[keywordId] = keyword.annotation(keywordValue, undefined as unknown as JsonNode, context);
      return true;
    } catch {
      // Some annotation functions expect a real instance node; skip rather than crash.
    }
  }
  return false;
}

function toAnnotations(records: AnnotationRecord[]): Annotation[] {
  return records.map((record) => new Annotation(record));
}

// A schema's annotations are only used once at a location. If they apply both
// no matter what the value is and because of what the value is, they're a
// location annotation. Annotations at `valuePointer` are appended as value
// annotations.
function appendAnnotations(target: RecordedAnnotations, source: RecordedAnnotations, valuePointer?: string) {
  for (const pointer in source) {
    target[pointer] ??= [];
    const isValue = pointer === valuePointer;
    for (const recorded of source[pointer]) {
      const index = target[pointer].findIndex(({ annotation }) => annotation === recorded.annotation);
      if (index === -1) {
        target[pointer].push(isValue ? { kind: "value", annotation: recorded.annotation } : recorded);
      } else if (!isValue && recorded.kind === "location") {
        target[pointer][index] = recorded;
      }
    }
  }
}

function splitPointer(pointer: string): [string, string] {
  const lastSlash = pointer.lastIndexOf("/");
  const propertyName = pointer.slice(lastSlash + 1)
    .replace(/~1/g, "/")
    .replace(/~0/g, "~");
  return [pointer.slice(0, lastSlash), propertyName];
}
