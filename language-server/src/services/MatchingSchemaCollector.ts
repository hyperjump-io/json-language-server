import * as Instance from "@hyperjump/json-schema/instance/experimental";

import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node, Keyword } from "@hyperjump/json-schema/experimental";

type Annotation = Record<string, unknown>;

type MatchingSchemaContext = ValidationContext & {
  pendingAnnotations?: Annotation;
  unconditionalAnnotations?: Annotation;
  declaredProperties?: Set<string>;
  passedProperties?: Set<string>;
  failedProperties?: Set<string>;
  rejectedProperties?: Set<string>;
  negated?: boolean;
  isAlternative?: boolean;
};

type Alternative = {
  declaredProperties: Set<string>;
  rejectedProperties: Set<string>;
  isAlternative: boolean;
};

export class MatchingSchemaCollector implements EvaluationPlugin {
  private annotations: Map<string, Annotation[]> = new Map();
  private alternatives: Map<string, Alternative[]> = new Map();
  private acceptedProperties: Map<string, Set<string>> = new Map();
  private forbiddenProperties: Map<string, Set<string>> = new Map();

  beforeSchema(_url: string, _instance: JsonNode, context: MatchingSchemaContext): void {
    context.pendingAnnotations = {};
    context.unconditionalAnnotations = {};
    context.declaredProperties = undefined;
    context.rejectedProperties = undefined;
  }

  beforeKeyword(node: Node<unknown>, _instance: JsonNode, context: MatchingSchemaContext, schemaContext: MatchingSchemaContext): void {
    const [keywordId] = node;
    const negated = schemaContext.negated ?? false;
    context.negated = keywordId === "https://json-schema.org/keyword/not" ? !negated : negated;

    const alternative = schemaContext.isAlternative ?? false;
    context.isAlternative = keywordId === "https://json-schema.org/keyword/anyOf" || keywordId === "https://json-schema.org/keyword/oneOf"
      ? true
      : alternative;
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: MatchingSchemaContext, _valid: boolean, schemaContext: MatchingSchemaContext, keyword: Keyword<unknown>): void {
    const [keywordId, , keywordValue] = node;

    // Annotations

    if (keyword.annotation) {
      schemaContext.pendingAnnotations ??= {};
      schemaContext.pendingAnnotations[keywordId] = keyword.annotation(keywordValue, instance, context);
    }

    if (keywordId === "https://json-schema.org/keyword/type") {
      schemaContext.unconditionalAnnotations ??= {};
      schemaContext.unconditionalAnnotations[keywordId] = keywordValue;
    }

    // Property Completion

    if (keywordId === "https://json-schema.org/keyword/required" && schemaContext.negated && instance.type === "object") {
      const required = keywordValue as string[];
      const missing = required.filter((propertyName) => !Instance.has(propertyName, instance));

      if (missing.length === 1) {
        const forbiddenProperties = this.forbiddenProperties.get(instance.pointer) ?? new Set();
        forbiddenProperties.add(missing[0]);
        this.forbiddenProperties.set(instance.pointer, forbiddenProperties);
      }
    }

    if (keywordId === "https://json-schema.org/keyword/properties") {
      schemaContext.declaredProperties ??= new Set();
      for (const propertyName in keywordValue as Record<string, unknown>) {
        schemaContext.declaredProperties.add(propertyName);
      }
    }

    if (keywordId === "https://json-schema.org/keyword/required") {
      schemaContext.declaredProperties ??= new Set();
      for (const propertyName of keywordValue as string[]) {
        schemaContext.declaredProperties.add(propertyName);
      }
    }

    if (keywordId === "https://json-schema.org/keyword/properties" || keywordId === "https://json-schema.org/keyword/additionalProperties" || keywordId === "https://json-schema.org/keyword/patternProperties") {
      if (!this.acceptedProperties.has(instance.pointer)) {
        this.acceptedProperties.set(instance.pointer, new Set());
      }
      addAll(this.acceptedProperties.get(instance.pointer)!, context.passedProperties);

      schemaContext.rejectedProperties ??= new Set();
      addAll(schemaContext.rejectedProperties, context.failedProperties);
    }
  }

  afterSchema(_schemaUri: string, instance: JsonNode, context: MatchingSchemaContext, valid: boolean): void {
    const hasAlways = context.unconditionalAnnotations;
    const hasGated = valid && context.pendingAnnotations;

    if (hasAlways || hasGated) {
      if (!this.annotations.has(instance.pointer)) {
        this.annotations.set(instance.pointer, []);
      }
      const merged = { ...(hasGated ? context.pendingAnnotations : {}), ...(hasAlways ? context.unconditionalAnnotations : {}) };
      this.annotations.get(instance.pointer)!.push(merged);
    }

    const propertyName = propertyNameOf(instance.pointer);
    if (propertyName !== undefined) {
      const outcome = valid ? (context.passedProperties ??= new Set()) : (context.failedProperties ??= new Set());
      outcome.add(propertyName);
    }

    const declaredProperties = context.declaredProperties ?? new Set<string>();
    const rejectedProperties = context.rejectedProperties ?? new Set<string>();
    const isAlternative = context.isAlternative ?? false;

    if (declaredProperties.size > 0 || rejectedProperties.size > 0) {
      const alternatives = this.alternatives.get(instance.pointer) ?? [];
      alternatives.push({ declaredProperties, rejectedProperties, isAlternative });
      this.alternatives.set(instance.pointer, alternatives);
    }
  }

  getAnnotations(instanceLocation: string): Annotation[] {
    return this.annotations.get(instanceLocation) ?? [];
  }

  getDeclaredProperties(instanceLocation: string): Set<string> {
    const alternatives = this.alternatives.get(instanceLocation) ?? [];
    const acceptedProperties = this.acceptedProperties.get(instanceLocation) ?? new Set();

    const propertyNames = new Set<string>();
    for (const alternative of alternatives) {
      const isContradicted = [...alternative.rejectedProperties].some((propertyName) => acceptedProperties.has(propertyName));
      if (!alternative.isAlternative || !isContradicted) {
        addAll(propertyNames, alternative.declaredProperties);
      }
    }

    const forbiddenProperties = this.forbiddenProperties.get(instanceLocation);
    return forbiddenProperties ? propertyNames.difference(forbiddenProperties) : propertyNames;
  }

  hasDeclaredProperty(instanceLocation: string, propertyName: string): boolean {
    const alternatives = this.alternatives.get(instanceLocation) ?? [];
    const acceptedProperties = this.acceptedProperties.get(instanceLocation) ?? new Set();

    for (const alternative of alternatives) {
      const isContradicted = [...alternative.rejectedProperties].some((p) => acceptedProperties.has(p));
      if ((!alternative.isAlternative || !isContradicted) && alternative.declaredProperties.has(propertyName)) {
        return true;
      }
    }
    return false;
  }
}

const addAll = (target: Set<string>, source?: Iterable<string>) => {
  for (const entry of source ?? []) {
    target.add(entry);
  }
};

const propertyNameOf = (instanceLocation: string) => {
  if (instanceLocation === "") {
    return undefined;
  }

  const lastSegment = instanceLocation.slice(instanceLocation.lastIndexOf("/") + 1);
  return lastSegment;
};
