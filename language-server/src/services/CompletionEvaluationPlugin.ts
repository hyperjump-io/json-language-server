import * as Instance from "@hyperjump/json-schema/instance/experimental";

import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node } from "@hyperjump/json-schema/experimental";

type PropertyValueInfo = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  hasConst: boolean;
  excluded?: unknown[];
  excludedTypes?: string[];
  permitsAnyValue?: boolean;
};

type CompletionContext = ValidationContext & {
  declaredProperties?: Map<string, PropertyValueInfo>;
  additionalPropertiesInfo?: PropertyValueInfo;
  passedProperties?: Set<string>;
  failedProperties?: Set<string>;
  rejectedProperties?: Set<string>;
  negated?: boolean;
  isAnyOf?: boolean;
  isOneOf?: boolean;
  groupId?: number;
  inIfCondition?: boolean;
};

type Alternative = {
  declaredProperties: Map<string, PropertyValueInfo>;
  additionalPropertiesInfo?: PropertyValueInfo;
  rejectedProperties: Set<string>;
  isAnyOf?: boolean;
  isOneOf?: boolean;
  groupId?: number;
};

export class CompletionEvaluationPlugin implements EvaluationPlugin {
  private alternatives: Map<string, Alternative[]> = new Map();
  private acceptedProperties: Map<string, Set<string>> = new Map();
  private forbiddenProperties: Map<string, Set<string>> = new Map();

  private allOfCheckpoints: Map<string, number[]> = new Map();
  private nextGroupId = 0;

  private ast?: Record<string, unknown>;

  beforeSchema(_url: string, _instance: JsonNode, context: CompletionContext): void {
    context.declaredProperties = undefined;
    context.additionalPropertiesInfo = undefined;
    context.rejectedProperties = undefined;
    this.ast ??= context.ast as Record<string, unknown>;
  }

  beforeKeyword(node: Node<unknown>, instance: JsonNode, context: CompletionContext, schemaContext: CompletionContext): void {
    const [keywordId] = node;
    const negated = schemaContext.negated ?? false;
    context.negated = keywordId === "https://json-schema.org/keyword/not" ? !negated : negated;

    const anyOf = schemaContext.isAnyOf ?? false;
    context.isAnyOf = keywordId === "https://json-schema.org/keyword/anyOf" ? true : anyOf;

    const oneOf = schemaContext.isOneOf ?? false;
    context.isOneOf = keywordId === "https://json-schema.org/keyword/oneOf" ? true : oneOf;

    context.inIfCondition = keywordId === "https://json-schema.org/keyword/if" ? true : (schemaContext.inIfCondition ?? false);

    const isCombinator = keywordId === "https://json-schema.org/keyword/allOf" || keywordId === "https://json-schema.org/keyword/anyOf" || keywordId === "https://json-schema.org/keyword/oneOf";
    context.groupId = isCombinator ? this.nextGroupId++ : schemaContext.groupId;

    if (keywordId === "https://json-schema.org/keyword/allOf") {
      const checkpoints = this.allOfCheckpoints.get(instance.pointer) ?? [];
      checkpoints.push((this.alternatives.get(instance.pointer) ?? []).length);
      this.allOfCheckpoints.set(instance.pointer, checkpoints);
    }
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: CompletionContext, _valid: boolean, schemaContext: CompletionContext): void {
    const [keywordId, , keywordValue] = node;

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

    if (keywordId === "https://json-schema.org/keyword/additionalProperties") {
      const [, schemaUri] = keywordValue as [unknown, string];
      schemaContext.additionalPropertiesInfo = resolveValueInfo(this.ast, schemaUri);
    }

    if (keywordId === "https://json-schema.org/keyword/properties" || keywordId === "https://json-schema.org/keyword/additionalProperties" || keywordId === "https://json-schema.org/keyword/patternProperties") {
      if (!this.acceptedProperties.has(instance.pointer)) {
        this.acceptedProperties.set(instance.pointer, new Set());
      }
      addAll(this.acceptedProperties.get(instance.pointer)!, context.passedProperties);

      schemaContext.rejectedProperties ??= new Set();
      addAll(schemaContext.rejectedProperties, context.failedProperties);
    }

    if (keywordId === "https://json-schema.org/keyword/allOf") {
      const checkpoints = this.allOfCheckpoints.get(instance.pointer);
      const checkpoint = checkpoints?.pop() ?? 0;

      const bucket = this.alternatives.get(instance.pointer);
      if (bucket && bucket.length > checkpoint) {
        const branches = bucket.splice(checkpoint);
        const mine = branches.filter((branch) => branch.groupId === context.groupId);
        const other = branches.filter((branch) => branch.groupId !== context.groupId);

        bucket.push(...other);
        if (mine.length > 0) {
          bucket.push(collapseAllOfBranches(mine, schemaContext.groupId));
        }
      }
    }
  }

  afterSchema(_schemaUri: string, instance: JsonNode, context: CompletionContext, valid: boolean): void {
    const propertyName = propertyNameOf(instance.pointer);
    if (propertyName !== undefined) {
      const outcome = valid ? (context.passedProperties ??= new Set()) : (context.failedProperties ??= new Set());
      outcome.add(propertyName);
    }

    const declaredProperties = context.declaredProperties ?? new Map<string, PropertyValueInfo>();
    const rejectedProperties = context.rejectedProperties ?? new Set<string>();
    const isAnyOf = context.isAnyOf ?? false;
    const isOneOf = context.isOneOf ?? false;

    if (!context.inIfCondition && (declaredProperties.size > 0 || rejectedProperties.size > 0 || context.additionalPropertiesInfo)) {
      const alternatives = this.alternatives.get(instance.pointer) ?? [];
      alternatives.push({
        declaredProperties,
        additionalPropertiesInfo: context.additionalPropertiesInfo,
        rejectedProperties,
        isAnyOf,
        isOneOf,
        groupId: context.groupId
      });
      this.alternatives.set(instance.pointer, alternatives);
    }
  }

  getDeclaredProperties(instanceLocation: string): Set<string> {
    const alternatives = this.alternatives.get(instanceLocation) ?? [];
    const acceptedProperties = this.acceptedProperties.get(instanceLocation) ?? new Set();

    const propertyNames = new Set<string>();
    for (const alternative of alternatives) {
      const isContradicted = [...alternative.rejectedProperties].some((propertyName) => acceptedProperties.has(propertyName));
      if ((!alternative.isAnyOf && !alternative.isOneOf) || !isContradicted) {
        addAll(propertyNames, alternative.declaredProperties?.keys());
      }
    }

    const forbiddenProperties = this.forbiddenProperties.get(instanceLocation);
    return forbiddenProperties ? propertyNames.difference(forbiddenProperties) : propertyNames;
  }

  getPropertyValueInfo(instanceLocation: string, propertyName: string): PropertyValueInfo | undefined {
    const alternatives = this.alternatives.get(instanceLocation) ?? [];
    const acceptedProperties = this.acceptedProperties.get(instanceLocation) ?? new Set();

    let constraints: PropertyValueInfo | undefined;
    let choices: PropertyValueInfo | undefined;
    const oneOfInfos: PropertyValueInfo[] = [];

    for (const alternative of alternatives) {
      const isContradicted = [...alternative.rejectedProperties].some((p) => acceptedProperties.has(p));
      if ((alternative.isAnyOf || alternative.isOneOf) && isContradicted) {
        continue;
      }

      const info = alternative.declaredProperties.get(propertyName) ?? alternative.additionalPropertiesInfo;
      if (!info) {
        continue;
      }

      if (alternative.isAnyOf) {
        choices = choices ? unionValueInfo(choices, info) : info;
      } else if (alternative.isOneOf) {
        oneOfInfos.push(info);
      } else {
        constraints = constraints ? intersectValueInfo(constraints, info) : info;
      }
    }

    if (oneOfInfos.length > 0) {
      const oneOfResult = exactlyOneValueInfo(oneOfInfos);
      choices = choices ? unionValueInfo(choices, oneOfResult) : oneOfResult;
    }

    return constraints && choices ? intersectValueInfo(constraints, choices) : choices ?? constraints;
  }
}

const addAll = (target: Set<string>, source?: Iterable<string>) => {
  for (const entry of source ?? []) {
    target.add(entry);
  }
};

const collapseAllOfBranches = (branches: Alternative[], groupId: number | undefined): Alternative => {
  const declaredProperties = new Map<string, PropertyValueInfo>();
  const rejectedProperties = new Set<string>();
  let additionalPropertiesInfo: PropertyValueInfo | undefined;

  for (const branch of branches) {
    addAll(rejectedProperties, branch.rejectedProperties);
    for (const [propertyName, info] of branch.declaredProperties) {
      const existing = declaredProperties.get(propertyName);
      declaredProperties.set(propertyName, existing ? intersectValueInfo(existing, info) : info);
    }
    if (branch.additionalPropertiesInfo) {
      additionalPropertiesInfo = additionalPropertiesInfo
        ? intersectValueInfo(additionalPropertiesInfo, branch.additionalPropertiesInfo)
        : branch.additionalPropertiesInfo;
    }
  }

  return { declaredProperties, additionalPropertiesInfo, rejectedProperties, isAnyOf: branches[0].isAnyOf, isOneOf: branches[0].isOneOf, groupId };
};

const propertyNameOf = (instanceLocation: string) => {
  if (instanceLocation === "") {
    return undefined;
  }

  const lastSegment = instanceLocation.slice(instanceLocation.lastIndexOf("/") + 1);
  return lastSegment;
};

const resolveValueInfo = (ast: Record<string, unknown> | undefined, schemaUri: string, visited: Set<string> = new Set()): PropertyValueInfo => {
  try {
    const info: PropertyValueInfo = { hasConst: false };
    const node = ast?.[schemaUri];
    // `$ref` can point back into a schema we're already inside, so stop rather than recurse forever
    if (!Array.isArray(node) || visited.has(schemaUri)) {
      return info;
    }
    const path = new Set(visited).add(schemaUri);

    // Combinators nested inside a leaf schema are resolved here rather than by the evaluation hooks, which only see combinators at object lvl
    const nestedInfos: PropertyValueInfo[] = [];
    let thenInfo: PropertyValueInfo | undefined;
    let elseInfo: PropertyValueInfo | undefined;

    for (const [keywordId, , keywordValue] of node as [string, unknown, unknown][]) {
      if (keywordId === "https://json-schema.org/keyword/type") {
        info.type = keywordValue as string | string[];
      } else if (keywordId === "https://json-schema.org/keyword/enum") {
        info.enum = (keywordValue as string[]).map((v) => JSON.parse(v) as unknown);
      } else if (keywordId === "https://json-schema.org/keyword/const") {
        info.const = JSON.parse(keywordValue as string) as unknown;
        info.hasConst = true;
      } else if (keywordId === "https://json-schema.org/keyword/not") {
        info.excluded = resolveExcludedValues(ast, keywordValue as string);
        info.excludedTypes = resolveExcludedTypes(ast, keywordValue as string);
      } else if (keywordId === "https://json-schema.org/keyword/allOf") {
        const branches = (keywordValue as string[]).map((uri) => resolveValueInfo(ast, uri, path));
        if (branches.length > 0) {
          nestedInfos.push(branches.reduce((a, b) => intersectValueInfo(a, b)));
        }
      } else if (keywordId === "https://json-schema.org/keyword/anyOf") {
        const branches = (keywordValue as string[]).map((uri) => resolveValueInfo(ast, uri, path));
        if (branches.length > 0) {
          nestedInfos.push(branches.reduce((a, b) => unionValueInfo(a, b)));
        }
      } else if (keywordId === "https://json-schema.org/keyword/oneOf") {
        const branches = (keywordValue as string[]).map((uri) => resolveValueInfo(ast, uri, path));
        if (branches.length > 0) {
          nestedInfos.push(exactlyOneValueInfo(branches));
        }
      } else if (keywordId === "https://json-schema.org/keyword/ref") {
        // A `$ref` in the schema being validated against, not one in the document being edited, only reaches $refs that appear in a property's own subschema
        nestedInfos.push(resolveValueInfo(ast, keywordValue as string, path));
      } else if (keywordId === "https://json-schema.org/keyword/then") {
        const [, thenUri] = keywordValue as string[];
        thenInfo = thenUri ? resolveValueInfo(ast, thenUri, path) : undefined;
      } else if (keywordId === "https://json-schema.org/keyword/else") {
        const [, elseUri] = keywordValue as string[];
        elseInfo = elseUri ? resolveValueInfo(ast, elseUri, path) : undefined;
      }
    }

    if (thenInfo ?? elseInfo) {
      nestedInfos.push(unionValueInfo(thenInfo ?? { hasConst: false }, elseInfo ?? { hasConst: false }));
    }

    if (info.excludedTypes && info.type) {
      const excludedTypesSet = new Set(info.excludedTypes);
      info.type = (Array.isArray(info.type) ? info.type : [info.type]).filter((t) => !excludedTypesSet.has(t));
    }

    if (info.type) {
      const allowedTypes = new Set(Array.isArray(info.type) ? info.type : [info.type]);
      if (info.enum) {
        info.enum = info.enum.filter((value) => allowedTypes.has(jsonTypeOf(value)));
      }
      if (info.hasConst && !allowedTypes.has(jsonTypeOf(info.const))) {
        info.hasConst = false;
        info.const = undefined;
      }
    }

    if (info.excluded) {
      const excludedKeys = new Set(info.excluded.map((value) => JSON.stringify(value)));
      if (info.enum) {
        info.enum = info.enum.filter((value) => !excludedKeys.has(JSON.stringify(value)));
      }
      if (info.hasConst && excludedKeys.has(JSON.stringify(info.const))) {
        info.hasConst = false;
        info.const = undefined;
      }
    }

    if (nestedInfos.length > 0) {
      const combined = nestedInfos.reduce((a, b) => intersectValueInfo(a, b));
      return isUnconstrained(info) ? combined : intersectValueInfo(info, combined);
    }

    return info;
  } catch {
    return { hasConst: false };
  }
};

const resolveExcludedValues = (ast: Record<string, unknown> | undefined, schemaUri: string): unknown[] | undefined => {
  const node = ast?.[schemaUri];
  if (!Array.isArray(node)) {
    return undefined;
  }

  const values: unknown[] = [];
  for (const [keywordId, , keywordValue] of node as [string, unknown, unknown][]) {
    if (keywordId === "https://json-schema.org/keyword/const") {
      values.push(JSON.parse(keywordValue as string) as unknown);
    } else if (keywordId === "https://json-schema.org/keyword/enum") {
      values.push(...(keywordValue as string[]).map((v) => JSON.parse(v) as unknown));
    }
  }
  return values.length > 0 ? values : undefined;
};

const resolveExcludedTypes = (ast: Record<string, unknown> | undefined, schemaUri: string): string[] | undefined => {
  const node = ast?.[schemaUri];
  if (!Array.isArray(node)) {
    return undefined;
  }

  for (const [keywordId, , keywordValue] of node as [string, unknown, unknown][]) {
    if (keywordId === "https://json-schema.org/keyword/type") {
      const type = keywordValue as string | string[];
      return Array.isArray(type) ? type : [type];
    }
  }
  return undefined;
};

const intersectValueInfo = (a: PropertyValueInfo, b: PropertyValueInfo): PropertyValueInfo => {
  let excludedTypes: string[] | undefined;
  if (a.excludedTypes ?? b.excludedTypes) {
    const seen = new Set<string>();
    excludedTypes = [];
    for (const t of [...(a.excludedTypes ?? []), ...(b.excludedTypes ?? [])]) {
      if (!seen.has(t)) {
        seen.add(t);
        excludedTypes.push(t);
      }
    }
  }

  let type = a.type !== undefined && b.type !== undefined
    ? (JSON.stringify(a.type) === JSON.stringify(b.type) ? a.type : [])
    : a.type ?? b.type;

  if (excludedTypes && type) {
    const excludedTypesSet = new Set(excludedTypes);
    type = (Array.isArray(type) ? type : [type]).filter((t) => !excludedTypesSet.has(t));
  }

  let enumValues: unknown[] | undefined;
  if (a.enum && b.enum) {
    const enumA = new Set(a.enum.map((v) => JSON.stringify(v)));
    const enumB = new Set(b.enum.map((v) => JSON.stringify(v)));
    enumValues = [...enumA.intersection(enumB)].map((v) => JSON.parse(v));
  } else {
    enumValues = a.enum ?? b.enum;
  }

  const bothHaveConst = a.hasConst && b.hasConst;
  const constsMatch = bothHaveConst && JSON.stringify(a.const) === JSON.stringify(b.const);
  let hasConst = bothHaveConst ? constsMatch : (a.hasConst || b.hasConst);
  let constValue = bothHaveConst ? (constsMatch ? a.const : undefined) : (a.hasConst ? a.const : b.const);

  if (enumValues && type) {
    const allowedTypes = new Set(Array.isArray(type) ? type : [type]);
    enumValues = enumValues.filter((value) => allowedTypes.has(jsonTypeOf(value)));
  }

  let excluded: unknown[] | undefined;
  if (a.excluded ?? b.excluded) {
    const seen = new Set<string>();
    excluded = [];
    for (const value of [...(a.excluded ?? []), ...(b.excluded ?? [])]) {
      const key = JSON.stringify(value);
      if (!seen.has(key)) {
        seen.add(key);
        excluded.push(value);
      }
    }
  }

  if (excluded) {
    const excludedKeys = new Set(excluded.map((value) => JSON.stringify(value)));
    if (enumValues) {
      enumValues = enumValues.filter((value) => !excludedKeys.has(JSON.stringify(value)));
    }
    if (hasConst && excludedKeys.has(JSON.stringify(constValue))) {
      hasConst = false;
      constValue = undefined;
    }
  }

  return { type, enum: enumValues, const: constValue, hasConst, excluded, excludedTypes, permitsAnyValue: (isOpen(a) && isOpen(b)) || undefined };
};

const isOpen = (info: PropertyValueInfo): boolean => {
  return info.permitsAnyValue === true || (!info.hasConst && info.enum === undefined);
};

const exactlyOneValueInfo = (infos: PropertyValueInfo[]): PropertyValueInfo => {
  const unioned = infos.reduce((a, b) => unionValueInfo(a, b));

  const valuesOf = (info: PropertyValueInfo) => info.hasConst ? [info.const] : info.enum;
  const counts = new Map<string, number>();
  for (const info of infos) {
    for (const value of valuesOf(info) ?? []) {
      const key = JSON.stringify(value);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const enumValues = unioned.enum?.filter((value) => counts.get(JSON.stringify(value)) === 1);

  return { ...unioned, enum: enumValues };
};

const isUnconstrained = (info: PropertyValueInfo): boolean => {
  return info.type === undefined && !info.hasConst && info.enum === undefined
    && info.excluded === undefined && info.excludedTypes === undefined;
};

const unionValueInfo = (a: PropertyValueInfo, b: PropertyValueInfo): PropertyValueInfo => {
  const aIsUnconstrained = isUnconstrained(a);
  const bIsUnconstrained = isUnconstrained(b);
  if (aIsUnconstrained && bIsUnconstrained) {
    return { hasConst: false, permitsAnyValue: true };
  }
  if (aIsUnconstrained) {
    return { ...b, type: undefined, excluded: undefined, excludedTypes: undefined, permitsAnyValue: true };
  }
  if (bIsUnconstrained) {
    return { ...a, type: undefined, excluded: undefined, excludedTypes: undefined, permitsAnyValue: true };
  }

  let type: string | string[] | undefined;
  let namesTypeAndValues = false;
  if (a.type !== undefined && b.type !== undefined) {
    const types = new Set([
      ...(Array.isArray(a.type) ? a.type : [a.type]),
      ...(Array.isArray(b.type) ? b.type : [b.type])
    ]);
    type = types.size === 1 ? [...types][0] : [...types];
  } else if (a.type ?? b.type) {
    const typeSide = a.type !== undefined ? a : b;
    if (!typeSide.hasConst && typeSide.enum === undefined) {
      type = typeSide.type;
      namesTypeAndValues = true;
    }
  }

  let excludedTypes: string[] | undefined;
  if (a.excludedTypes && b.excludedTypes) {
    const bSet = new Set(b.excludedTypes);
    excludedTypes = a.excludedTypes.filter((t) => bSet.has(t));
    if (excludedTypes.length === 0) {
      excludedTypes = undefined;
    }
  }

  if (excludedTypes && type) {
    const excludedTypesSet = new Set(excludedTypes);
    type = (Array.isArray(type) ? type : [type]).filter((t) => !excludedTypesSet.has(t));
  }

  const valuesOf = (info: PropertyValueInfo) => info.hasConst ? [info.const] : info.enum;
  const aValues = valuesOf(a);
  const bValues = valuesOf(b);

  let enumValues: unknown[] | undefined;
  if (aValues && bValues) {
    const seen = new Set(aValues.map((value) => JSON.stringify(value)));
    enumValues = [...aValues];
    for (const value of bValues) {
      const key = JSON.stringify(value);
      if (!seen.has(key)) {
        seen.add(key);
        enumValues.push(value);
      }
    }
  } else {
    enumValues = aValues ?? bValues;
  }

  let excluded: unknown[] | undefined;
  if (a.excluded && b.excluded) {
    const bKeys = new Set(b.excluded.map((value) => JSON.stringify(value)));
    excluded = a.excluded.filter((value) => bKeys.has(JSON.stringify(value)));
    if (excluded.length === 0) {
      excluded = undefined;
    }
  }

  if (excluded && enumValues) {
    const excludedKeys = new Set(excluded.map((value) => JSON.stringify(value)));
    enumValues = enumValues.filter((value) => !excludedKeys.has(JSON.stringify(value)));
  }

  return { type, enum: enumValues, hasConst: false, excluded, excludedTypes, permitsAnyValue: namesTypeAndValues || undefined };
};

const jsonTypeOf = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  const t = typeof value;
  return t === "number" ? "number" : t;
};
