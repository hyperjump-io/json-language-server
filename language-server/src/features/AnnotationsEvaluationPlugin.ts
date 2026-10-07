import { getKeyword } from "@hyperjump/json-schema/experimental";
import * as JsonPointer from "@hyperjump/json-pointer";
import { SubschemaTracker } from "./SubschemaTracker.ts";

import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node, Keyword } from "@hyperjump/json-schema/experimental";

export type Annotation = Record<string, unknown>;

// A location annotation applies no matter what the value at the location is.
// A value annotation applies only because of what the value is, such as an
// annotation from an anyOf alternative.
type RecordedAnnotation = { kind: "location" | "value"; annotation: Annotation };
type Annotations = Record<string, RecordedAnnotation[]>;

type SchemaResult = {
  pointer: string;
  annotations: Annotations;
};

type MatchingSchemaContext = ValidationContext & {
  pendingAnnotations?: Annotation;
  schemaAnnotations?: Annotations;
  dynamicAnchors?: Record<string, string>;
  evaluatedProperties?: Set<string>;
  schemaEvaluatedProperties?: Set<string>;
  evaluatedItems?: Set<number>;
  schemaEvaluatedItems?: Set<number>;
  annotationsUnevaluatedProperties?: string[];
  annotationsUnevaluatedItems?: number[];
};

export class AnnotationsEvaluationPlugin implements EvaluationPlugin {
  static readonly id = "annotations";

  private annotations: Annotations = Object.create(null);
  private incompleteLocations: Set<string>;
  private subschemaTracker = new SubschemaTracker<SchemaResult>();

  constructor(incompleteLocations: Set<string> = new Set()) {
    this.incompleteLocations = incompleteLocations;
  }

  beforeSchema(_url: string, _instance: JsonNode, context: MatchingSchemaContext): void {
    context.pendingAnnotations = {};
    context.schemaAnnotations = Object.create(null);
    this.subschemaTracker.beforeSchema(context);
  }

  beforeKeyword(keywordNode: Node<unknown>, instance: JsonNode, context: MatchingSchemaContext, schemaContext: MatchingSchemaContext): void {
    const [keywordId, , keywordValue] = keywordNode;

    this.subschemaTracker.beforeKeyword(context);

    switch (keywordId) {
      case "https://json-schema.org/keyword/properties": {
        const properties = keywordValue as Record<string, string>;
        for (const propertyName in properties) {
          const pointer = JsonPointer.append(propertyName, instance.pointer);
          if (this.incompleteLocations.has(pointer)) {
            this.recordBuiltAnnotation(pointer, properties[propertyName], schemaContext);
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/patternProperties": {
        const patternProperties = keywordValue as [RegExp, string][];
        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer !== instance.pointer) {
            continue;
          }

          for (const [pattern, schemaUri] of patternProperties) {
            if (pattern.test(propertyName)) {
              this.recordBuiltAnnotation(pointer, schemaUri, schemaContext);
              context.evaluatedProperties?.add(propertyName);
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/additionalProperties": {
        const [isDeclaredProperty, schemaUri] = keywordValue as [RegExp, string];
        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !isDeclaredProperty.test(propertyName)) {
            this.recordBuiltAnnotation(pointer, schemaUri, schemaContext);
            context.evaluatedProperties?.add(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedProperties": {
        const schemaUri = keywordValue as string;
        for (const pointer of this.incompleteLocations) {
          const [parentPointer, propertyName] = splitPointer(pointer);
          if (parentPointer === instance.pointer && !context.schemaEvaluatedProperties!.has(propertyName)) {
            this.recordBuiltAnnotation(pointer, schemaUri, schemaContext);
            context.annotationsUnevaluatedProperties ??= [];
            context.annotationsUnevaluatedProperties.push(propertyName);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/prefixItems": {
        const prefixItems = keywordValue as string[];
        for (let itemIndex = 0; itemIndex < prefixItems.length; itemIndex++) {
          const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
          if (this.incompleteLocations.has(pointer)) {
            this.recordBuiltAnnotation(pointer, prefixItems[itemIndex], schemaContext);
            context.evaluatedItems?.add(itemIndex);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/draft-04/additionalItems":
      case "https://json-schema.org/keyword/items": {
        const [numberOfPrefixItems, schemaUri] = keywordValue as [number, string];
        for (const pointer of this.incompleteLocations) {
          const [parentPointer, indexStr] = splitPointer(pointer);
          const itemIndex = Number(indexStr);
          if (parentPointer === instance.pointer && itemIndex >= numberOfPrefixItems) {
            this.recordBuiltAnnotation(pointer, schemaUri, schemaContext);
            context.evaluatedItems?.add(itemIndex);
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/draft-04/items": {
        if (typeof keywordValue === "string") {
          for (const pointer of this.incompleteLocations) {
            const [parentPointer, indexStr] = splitPointer(pointer);
            const itemIndex = Number(indexStr);
            if (parentPointer === instance.pointer && Number.isInteger(itemIndex)) {
              this.recordBuiltAnnotation(pointer, keywordValue, schemaContext);
              context.evaluatedItems?.add(itemIndex);
            }
          }
        } else {
          const items = keywordValue as string[];
          for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const pointer = JsonPointer.append(`${itemIndex}`, instance.pointer);
            if (this.incompleteLocations.has(pointer)) {
              this.recordBuiltAnnotation(pointer, items[itemIndex], schemaContext);
              context.evaluatedItems?.add(itemIndex);
            }
          }
        }
        break;
      }

      case "https://json-schema.org/keyword/unevaluatedItems": {
        const schemaUri = keywordValue as string;
        for (const pointer of this.incompleteLocations) {
          const [parentPointer, indexStr] = splitPointer(pointer);
          const itemIndex = Number(indexStr);
          if (parentPointer === instance.pointer && Number.isInteger(itemIndex) && !context.schemaEvaluatedItems!.has(itemIndex)) {
            this.recordBuiltAnnotation(pointer, schemaUri, schemaContext);
            context.annotationsUnevaluatedItems ??= [];
            context.annotationsUnevaluatedItems.push(itemIndex);
          }
        }
        break;
      }
    }
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: MatchingSchemaContext, valid: boolean, schemaContext: MatchingSchemaContext, keyword: Keyword<unknown>): void {
    const [keywordId, , keywordValue] = node;

    // Unevaluated keywords mark incomplete locations as evaluated only after every plugin's beforeKeyword has run.
    // Otherwise, other plugins would see them as already evaluated.
    for (const propertyName of context.annotationsUnevaluatedProperties ?? []) {
      context.evaluatedProperties?.add(propertyName);
    }
    for (const itemIndex of context.annotationsUnevaluatedItems ?? []) {
      context.evaluatedItems?.add(itemIndex);
    }

    this.subschemaTracker.afterKeyword(instance, context, valid, schemaContext);

    if (keyword.annotation) {
      schemaContext.pendingAnnotations ??= {};
      schemaContext.pendingAnnotations[keywordId] = keyword.annotation(keywordValue, instance, context);
    }

    // Annotations are retained for failing subschemas because the instance is
    // usually invalid while it's being edited. Only anyOf/oneOf alternatives
    // that are ruled out by a discriminating location are dropped.
    const subschemaResults = this.subschemaTracker.getSubschemaResults(context);
    let subschemaValues: SchemaResult[];
    switch (keywordId) {
      case "https://json-schema.org/keyword/anyOf":
      case "https://json-schema.org/keyword/oneOf":
        subschemaValues = this.subschemaTracker.discriminate(subschemaResults, instance);
        break;

      case "https://json-schema.org/keyword/not":
        // Annotations describe the instances a schema matches, so none of
        // them apply when it's negated
        subschemaValues = [];
        break;

      default:
        subschemaValues = subschemaResults.map((result) => result.value);
    }

    const isConditional = conditionalKeywords.has(keywordId);
    for (const { pointer, annotations } of subschemaValues) {
      appendAnnotations(schemaContext.schemaAnnotations!, isConditional ? asValueAnnotations(annotations, pointer) : annotations);
    }
  }

  afterSchema(_schemaUri: string, instance: JsonNode, context: MatchingSchemaContext, valid: boolean): void {
    // A schema's own annotations are kept even if it fails so they're still
    // available while the value is being edited
    if (context.pendingAnnotations) {
      appendAnnotations(context.schemaAnnotations!, {
        [instance.pointer]: [{ kind: "location", annotation: context.pendingAnnotations }]
      });
    }

    this.subschemaTracker.afterSchema(instance, context, valid, {
      pointer: instance.pointer,
      annotations: context.schemaAnnotations!
    });

    this.annotations = context.schemaAnnotations!;
  }

  // All annotations at a location, both location and value annotations
  getAnnotations(instanceLocation: string): Annotation[] {
    return (this.annotations[instanceLocation] ?? []).map(({ annotation }) => annotation);
  }

  // The annotations that apply no matter what the value at the location is.
  // These describe the property or item rather than its value.
  getLocationAnnotations(instanceLocation: string): Annotation[] {
    return this.getAnnotationsOfKind(instanceLocation, "location");
  }

  // The annotations that apply because of what the value at the location is.
  // For example, the annotations of an anyOf alternative.
  getValueAnnotations(instanceLocation: string): Annotation[] {
    return this.getAnnotationsOfKind(instanceLocation, "value");
  }

  private getAnnotationsOfKind(instanceLocation: string, kind: RecordedAnnotation["kind"]): Annotation[] {
    return (this.annotations[instanceLocation] ?? [])
      .filter((recorded) => recorded.kind === kind)
      .map(({ annotation }) => annotation);
  }

  // Produces one annotation object per schema, in the same shape as annotations
  // collected for complete locations, so annotations for the same keyword from
  // different schemas don't overwrite each other. `inProgress` holds the
  // schemas currently being expanded so a schema that references itself
  // in-place doesn't recurse forever. Annotations from anyOf/oneOf
  // alternatives are value annotations. $dynamicRef is resolved using the
  // dynamic scope of the parent, so it's an approximation.
  private buildAnnotations(schemaLocation: string, context: MatchingSchemaContext, inProgress: Set<string> = new Set()): RecordedAnnotation[] {
    if (inProgress.has(schemaLocation)) {
      return [];
    }

    const nodes = context.ast[schemaLocation];

    if (nodes === true || nodes === false) {
      return [{ kind: "location", annotation: {} }];
    }

    inProgress.add(schemaLocation);

    const subschemaAnnotations: RecordedAnnotation[] = [];
    const schemaAnnotation: Annotation = {};

    for (const node of nodes) {
      const [keywordId, , keywordValue] = node;

      switch (keywordId) {
        case "https://json-schema.org/keyword/ref":
          subschemaAnnotations.push(...this.buildAnnotations(keywordValue as string, context, inProgress));
          break;

        case "https://json-schema.org/keyword/dynamicRef":
          subschemaAnnotations.push(...this.buildAnnotations(context.dynamicAnchors![keywordValue as string], context, inProgress));
          break;

        case "https://json-schema.org/keyword/draft-2020-12/dynamicRef": {
          const [, fragment, ref] = keywordValue as [string, string, string];
          subschemaAnnotations.push(...this.buildAnnotations(context.dynamicAnchors![fragment] ?? ref, context, inProgress));
          break;
        }

        case "https://json-schema.org/keyword/allOf":
          for (const subSchemaLocation of keywordValue as string[]) {
            subschemaAnnotations.push(...this.buildAnnotations(subSchemaLocation, context, inProgress));
          }
          break;

        case "https://json-schema.org/keyword/anyOf":
        case "https://json-schema.org/keyword/oneOf":
          for (const subSchemaLocation of keywordValue as string[]) {
            for (const { annotation } of this.buildAnnotations(subSchemaLocation, context, inProgress)) {
              subschemaAnnotations.push({ kind: "value", annotation });
            }
          }
          break;

        default:
          addKeywordAnnotation(schemaAnnotation, node, context);
      }
    }

    inProgress.delete(schemaLocation);

    return [...subschemaAnnotations, { kind: "location", annotation: schemaAnnotation }];
  }

  private recordBuiltAnnotation(pointer: string, schemaLocation: string, context: MatchingSchemaContext) {
    appendAnnotations(context.schemaAnnotations!, { [pointer]: this.buildAnnotations(schemaLocation, context) });
  }
}

export function addKeywordAnnotation(annotation: Annotation, [keywordId, , keywordValue]: Node<unknown>, context: ValidationContext) {
  const keyword = getKeyword(keywordId);
  if (keyword?.annotation) {
    try {
      annotation[keywordId] = keyword.annotation(keywordValue, undefined as unknown as JsonNode, context);
    } catch {
      // Some annotation functions expect a real instance node; skip rather than crash.
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

function asValueAnnotations(annotations: Annotations, pointer: string): Annotations {
  if (!(pointer in annotations)) {
    return annotations;
  }

  return {
    ...annotations,
    [pointer]: annotations[pointer].map(({ annotation }) => ({ kind: "value", annotation }))
  };
}

function appendAnnotations(target: Annotations, source: Annotations) {
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
