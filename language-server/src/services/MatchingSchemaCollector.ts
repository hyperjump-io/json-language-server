import * as Instance from "@hyperjump/json-schema/instance/experimental";

import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node, Keyword } from "@hyperjump/json-schema/experimental";

type Annotation = Record<string, unknown>;

type PropertyValueInfo = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  hasConst: boolean;
};

type MatchingSchemaContext = ValidationContext & {
  pendingAnnotations?: Annotation;
  declaredProperties?: Map<string, PropertyValueInfo>;
  passedProperties?: Set<string>;
  failedProperties?: Set<string>;
  rejectedProperties?: Set<string>;
  negated?: boolean;
  isAlternative?: boolean;
};

type Alternative = {
  declaredProperties: Map<string, PropertyValueInfo>;
  rejectedProperties: Set<string>;
  isAlternative: boolean;
};

export class MatchingSchemaCollector implements EvaluationPlugin {
  private annotations: Map<string, Annotation[]> = new Map();
  private alternatives: Map<string, Alternative[]> = new Map();
  private acceptedProperties: Map<string, Set<string>> = new Map();
  private forbiddenProperties: Map<string, Set<string>> = new Map();
  private ast?: Record<string, unknown>;

  beforeSchema(_url: string, _instance: JsonNode, context: MatchingSchemaContext): void {
    context.pendingAnnotations = {};
    context.declaredProperties = undefined;
    context.rejectedProperties = undefined;
    this.ast ??= context.ast as Record<string, unknown>;
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

    if (keyword.annotation) {
      schemaContext.pendingAnnotations ??= {};
      schemaContext.pendingAnnotations[keywordId] = keyword.annotation(keywordValue, instance, context);
    }

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
      schemaContext.declaredProperties ??= new Map();
      for (const [propertyName, schemaUri] of Object.entries(keywordValue as Record<string, string>)) {
        if (!schemaContext.declaredProperties.has(propertyName)) {
          schemaContext.declaredProperties.set(propertyName, resolveValueInfo(this.ast, schemaUri));
        }
      }
    }

    if (keywordId === "https://json-schema.org/keyword/required") {
      schemaContext.declaredProperties ??= new Map();
      for (const propertyName of keywordValue as string[]) {
        if (!schemaContext.declaredProperties.has(propertyName)) {
          schemaContext.declaredProperties.set(propertyName, { hasConst: false });
        }
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
    if (valid && context.pendingAnnotations) {
      if (!this.annotations.has(instance.pointer)) {
        this.annotations.set(instance.pointer, []);
      }

      const existing = this.annotations.get(instance.pointer)!;
      existing.push(context.pendingAnnotations);
    }

    const propertyName = propertyNameOf(instance.pointer);
    if (propertyName !== undefined) {
      const outcome = valid ? (context.passedProperties ??= new Set()) : (context.failedProperties ??= new Set());
      outcome.add(propertyName);
    }

    const declaredProperties = context.declaredProperties ?? new Map<string, PropertyValueInfo>();
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
        addAll(propertyNames, alternative.declaredProperties?.keys());
      }
    }

    const forbiddenProperties = this.forbiddenProperties.get(instanceLocation);
    return forbiddenProperties ? propertyNames.difference(forbiddenProperties) : propertyNames;
  }

  getPropertyValueInfo(instanceLocation: string, propertyName: string): PropertyValueInfo | undefined {
    const alternatives = this.alternatives.get(instanceLocation) ?? [];
    const acceptedProperties = this.acceptedProperties.get(instanceLocation) ?? new Set();

    for (const alternative of alternatives) {
      const isContradicted = [...alternative.rejectedProperties].some((p) => acceptedProperties.has(p));
      if ((!alternative.isAlternative || !isContradicted) && alternative.declaredProperties.has(propertyName)) {
        return alternative.declaredProperties.get(propertyName);
      }
    }
    return undefined;
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

const resolveValueInfo = (ast: Record<string, unknown> | undefined, schemaUri: string): PropertyValueInfo => {
  try {
    const info: PropertyValueInfo = { hasConst: false };
    const node = ast?.[schemaUri];
    if (!Array.isArray(node)) {
      return info;
    }
    for (const [keywordId, , keywordValue] of node as [string, unknown, unknown][]) {
      if (keywordId === "https://json-schema.org/keyword/type") {
        info.type = keywordValue as string | string[];
      } else if (keywordId === "https://json-schema.org/keyword/enum") {
        info.enum = (keywordValue as string[]).map((v) => JSON.parse(v) as unknown);
      } else if (keywordId === "https://json-schema.org/keyword/const") {
        info.const = JSON.parse(keywordValue as string) as unknown;
        info.hasConst = true;
      }
    }
    return info;
  } catch {
    return { hasConst: false };
  }
};
