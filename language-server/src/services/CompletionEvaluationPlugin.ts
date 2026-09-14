import * as Instance from "@hyperjump/json-schema/instance/experimental";
import * as Pact from "@hyperjump/pact";

import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node } from "@hyperjump/json-schema/experimental";

export type PropertyValueInfo = {
  type?: Set<string>;
  enum?: Set<string>;
  enumDescriptions?: Map<string, string>;
  const?: string;
  excluded?: Set<string>;
  excludedTypes?: Set<string>;
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
  private alternatives = new Map<string, Alternative[]>();
  private acceptedProperties = new Map<string, Set<string>>();
  private forbiddenProperties = new Map<string, Set<string>>();
  private allOfCheckpoints = new Map<string, number[]>();
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
    context.isAnyOf = keywordId === "https://json-schema.org/keyword/anyOf" ? true : (schemaContext.isAnyOf ?? false);
    context.isOneOf = keywordId === "https://json-schema.org/keyword/oneOf" ? true : (schemaContext.isOneOf ?? false);
    context.inIfCondition = keywordId === "https://json-schema.org/keyword/if" ? true : (schemaContext.inIfCondition ?? false);

    const isCombinator = keywordId === "https://json-schema.org/keyword/allOf" || keywordId === "https://json-schema.org/keyword/anyOf" || keywordId === "https://json-schema.org/keyword/oneOf";
    context.groupId = isCombinator ? this.nextGroupId++ : schemaContext.groupId;

    if (keywordId === "https://json-schema.org/keyword/allOf") {
      getOrCreate(this.allOfCheckpoints, instance.pointer, () => []).push((this.alternatives.get(instance.pointer) ?? []).length);
    }
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: CompletionContext, _valid: boolean, schemaContext: CompletionContext): void {
    const [keywordId, , keywordValue] = node;

    if (keywordId === "https://json-schema.org/keyword/required" && schemaContext.negated && instance.type === "object") {
      const missing = (keywordValue as string[]).filter((name) => !Instance.has(name, instance));
      if (missing.length === 1) {
        getOrCreate(this.forbiddenProperties, instance.pointer, () => new Set()).add(missing[0]);
      }
    }

    if (keywordId === "https://json-schema.org/keyword/properties") {
      schemaContext.declaredProperties ??= new Map();
      for (const [name, schemaUri] of Object.entries(keywordValue as Record<string, string>)) {
        if (!schemaContext.declaredProperties.has(name)) {
          schemaContext.declaredProperties.set(name, resolveValueInfo(this.ast, schemaUri));
        }
      }
    }

    if (keywordId === "https://json-schema.org/keyword/required") {
      schemaContext.declaredProperties ??= new Map();
      for (const name of keywordValue as string[]) {
        if (!schemaContext.declaredProperties.has(name)) {
          schemaContext.declaredProperties.set(name, {});
        }
      }
    }

    if (keywordId === "https://json-schema.org/keyword/additionalProperties") {
      schemaContext.additionalPropertiesInfo = resolveValueInfo(this.ast, (keywordValue as [unknown, string])[1]);
    }

    if (keywordId === "https://json-schema.org/keyword/properties" || keywordId === "https://json-schema.org/keyword/additionalProperties" || keywordId === "https://json-schema.org/keyword/patternProperties") {
      addAll(getOrCreate(this.acceptedProperties, instance.pointer, () => new Set()), context.passedProperties);
      schemaContext.rejectedProperties ??= new Set();
      addAll(schemaContext.rejectedProperties, context.failedProperties);
    }

    if (keywordId === "https://json-schema.org/keyword/allOf") {
      const checkpoint = this.allOfCheckpoints.get(instance.pointer)?.pop() ?? 0;
      const bucket = this.alternatives.get(instance.pointer);
      if (bucket && bucket.length > checkpoint) {
        const branches = bucket.splice(checkpoint);
        const mine = branches.filter((branch) => branch.groupId === context.groupId);
        bucket.push(...branches.filter((branch) => branch.groupId !== context.groupId));
        if (mine.length > 0) {
          bucket.push(collapseAllOfBranches(mine, schemaContext.groupId));
        }
      }
    }
  }

  afterSchema(_schemaUri: string, instance: JsonNode, context: CompletionContext, valid: boolean): void {
    if (instance.pointer !== "") {
      const propertyName = instance.pointer.slice(instance.pointer.lastIndexOf("/") + 1);
      (valid ? (context.passedProperties ??= new Set()) : (context.failedProperties ??= new Set())).add(propertyName);
    }

    const { declaredProperties = new Map(), rejectedProperties = new Set(), isAnyOf, isOneOf, groupId, inIfCondition, additionalPropertiesInfo } = context;
    if (!inIfCondition && (declaredProperties.size > 0 || rejectedProperties.size > 0 || additionalPropertiesInfo)) {
      getOrCreate(this.alternatives, instance.pointer, () => []).push({
        declaredProperties, additionalPropertiesInfo, rejectedProperties, isAnyOf, isOneOf, groupId
      });
    }
  }

  private activeAlternatives(instanceLocation: string): Alternative[] {
    const acceptedProperties = this.acceptedProperties.get(instanceLocation) ?? new Set();
    return (this.alternatives.get(instanceLocation) ?? []).filter((alternative) => {
      const isCombinator = alternative.isAnyOf || alternative.isOneOf;
      return !(isCombinator && Pact.some((property) => acceptedProperties.has(property), alternative.rejectedProperties));
    });
  }

  getDeclaredProperties(instanceLocation: string): Set<string> {
    const propertyNames = new Set<string>();
    for (const alternative of this.activeAlternatives(instanceLocation)) {
      addAll(propertyNames, alternative.declaredProperties?.keys());
    }
    const forbiddenProperties = this.forbiddenProperties.get(instanceLocation);
    return forbiddenProperties ? propertyNames.difference(forbiddenProperties) : propertyNames;
  }

  getPropertyValueInfo(instanceLocation: string, propertyName: string): PropertyValueInfo | undefined {
    let constraints: PropertyValueInfo | undefined;
    let choices: PropertyValueInfo | undefined;
    const oneOfInfos: PropertyValueInfo[] = [];

    for (const alternative of this.activeAlternatives(instanceLocation)) {
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

const getOrCreate = <Key, Value>(map: Map<Key, Value>, key: Key, create: () => Value): Value => {
  let value = map.get(key);
  if (value === undefined) {
    value = create();
    map.set(key, value);
  }
  return value;
};

// De duplicate a list of primitives (e.g. type names) by identity.
const unique = (...values: (Iterable<string> | undefined)[]): Set<string> => Pact.collectSet(Pact.concat(...values.filter((value) => value !== undefined)));

const intersectValues = (first: Set<string>, second: Set<string>): Set<string> => Pact.collectSet(Pact.filter((value) => second.has(value), first));

const without = (values: Set<string>, remove: Set<string>): Set<string> => Pact.collectSet(Pact.filter((value) => !remove.has(value), values));

const typeList = (type: string | string[]): string[] => Array.isArray(type) ? type : [type];

const jsonTypeOf = (value: string): string => {
  switch (value.charAt(0)) {
    case "{":
      return "object";
    case "[":
      return "array";
    case "\"":
      return "string";
    case "t":
    case "f":
      return "boolean";
    case "n":
      return "null";
    default:
      return "number";
  }
};

const isType = (value: string, type: string): boolean => {
  if (type === "integer") {
    return jsonTypeOf(value) === "number" && Number.isInteger(Number(value));
  }
  return jsonTypeOf(value) === type;
};

const isAnyType = (value: string, types: Iterable<string>): boolean => Pact.some((type) => isType(value, type), types);

const mergeEnumDescriptions = (first: PropertyValueInfo, second: PropertyValueInfo): Map<string, string> | undefined => {
  return (first.enumDescriptions ?? second.enumDescriptions) ? new Map([...second.enumDescriptions ?? [], ...first.enumDescriptions ?? []]) : undefined;
};

// The JSON values (as strings) a value info constrains its property to, if any.
const valuesOf = (info: PropertyValueInfo): Set<string> | undefined => {
  if (info.const !== undefined) {
    return new Set([info.const]);
  }
  return info.enum;
};

const intersectTypes = (first: Set<string>, second: Set<string>): Set<string> => {
  const result = new Set<string>();
  for (const type of first) {
    if (second.has(type)) {
      result.add(type);
    } else if ((type === "number" && second.has("integer")) || (type === "integer" && second.has("number"))) {
      result.add("integer");
    }
  }
  return result;
};

const isUnconstrained = (info: PropertyValueInfo): boolean => !info.type && info.const === undefined && !info.enum && !info.excluded && !info.excludedTypes;

const isOpen = (info: PropertyValueInfo): boolean => info.permitsAnyValue === true || (info.const === undefined && !info.enum);

// Drop any enum/const values that contradict the info's own type, excludedTypes, or excluded set.
const dropContradictoryValues = (info: PropertyValueInfo): PropertyValueInfo => {
  let { type, enum: enumValues, const: constValue, excluded, excludedTypes } = info;

  if (type && excludedTypes) {
    type = without(type, excludedTypes);
  }

  const drop = (values: Set<string>): Set<string> => Pact.collectSet(Pact.filter((value) => {
    return (!type || isAnyType(value, type)) && (!excludedTypes || !isAnyType(value, excludedTypes)) && (!excluded || !excluded.has(value));
  }, values));

  if (enumValues) {
    enumValues = drop(enumValues);
  }
  if (constValue !== undefined && !drop(new Set([constValue])).has(constValue)) {
    constValue = undefined;
  }

  return { ...info, type, enum: enumValues, const: constValue };
};

const intersectValueInfo = (first: PropertyValueInfo, second: PropertyValueInfo): PropertyValueInfo => {
  const type = first.type && second.type ? intersectTypes(first.type, second.type) : first.type ?? second.type;
  const enumValues = first.enum && second.enum ? intersectValues(first.enum, second.enum) : first.enum ?? second.enum;
  const bothHaveConst = first.const !== undefined && second.const !== undefined;
  const constsMatch = bothHaveConst && first.const === second.const;

  return dropContradictoryValues({
    type,
    enum: enumValues,
    enumDescriptions: mergeEnumDescriptions(first, second),
    const: bothHaveConst ? (constsMatch ? first.const : undefined) : (first.const ?? second.const),
    excluded: (first.excluded ?? second.excluded) ? unique(first.excluded, second.excluded) : undefined,
    excludedTypes: (first.excludedTypes ?? second.excludedTypes) ? unique(first.excludedTypes, second.excludedTypes) : undefined,
    permitsAnyValue: (isOpen(first) && isOpen(second)) || undefined
  });
};

const unionValueInfo = (first: PropertyValueInfo, second: PropertyValueInfo): PropertyValueInfo => {
  if (isUnconstrained(first)) {
    return { ...second, type: undefined, excluded: undefined, excludedTypes: undefined, permitsAnyValue: true };
  }
  if (isUnconstrained(second)) {
    return { ...first, type: undefined, excluded: undefined, excludedTypes: undefined, permitsAnyValue: true };
  }

  let type: Set<string> | undefined;
  let namesTypeAndValues = false;

  if (first.type && second.type) {
    type = unique(first.type, second.type);
  } else if (first.type ?? second.type) {
    const side = first.type !== undefined ? first : second;
    if (side.const === undefined && !side.enum) {
      type = side.type;
      namesTypeAndValues = true;
    }
  }

  let excludedTypes: Set<string> | undefined;
  if (first.excludedTypes && second.excludedTypes) {
    const shared = intersectValues(first.excludedTypes, second.excludedTypes);
    excludedTypes = shared.size > 0 ? shared : undefined;
  }

  if (excludedTypes && type) {
    type = without(type, excludedTypes);
  }

  const firstValues = valuesOf(first);
  const secondValues = valuesOf(second);
  let enumValues = firstValues && secondValues ? unique(firstValues, secondValues) : firstValues ?? secondValues;

  let excluded: Set<string> | undefined;
  if (first.excluded && second.excluded) {
    const shared = intersectValues(first.excluded, second.excluded);
    excluded = shared.size > 0 ? shared : undefined;
  }

  if (excluded && enumValues) {
    enumValues = without(enumValues, excluded);
  }

  return { type, enum: enumValues, enumDescriptions: mergeEnumDescriptions(first, second), excluded, excludedTypes, permitsAnyValue: namesTypeAndValues || undefined };
};

const exactlyOneValueInfo = (infos: PropertyValueInfo[]): PropertyValueInfo => {
  const unioned = infos.reduce((merged, incoming) => unionValueInfo(merged, incoming));
  const counts = new Map<string, number>();
  for (const info of infos) {
    for (const value of valuesOf(info) ?? []) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  let enumValues: Set<string> | undefined;
  if (unioned.enum) {
    enumValues = Pact.collectSet(Pact.filter((value) => counts.get(value) === 1, unioned.enum));
  }
  return { ...unioned, enum: enumValues };
};

const collapseAllOfBranches = (branches: Alternative[], groupId: number | undefined): Alternative => {
  const declaredProperties = new Map<string, PropertyValueInfo>();
  const rejectedProperties = new Set<string>();
  for (const branch of branches) {
    addAll(rejectedProperties, branch.rejectedProperties);
    for (const [name, info] of branch.declaredProperties) {
      const existing = declaredProperties.get(name);
      declaredProperties.set(name, existing ? intersectValueInfo(existing, info) : info);
    }
  }
  return { declaredProperties, rejectedProperties, isAnyOf: branches[0].isAnyOf, isOneOf: branches[0].isOneOf, groupId };
};

// Read a not subschema for the values and types it forbids, in a single pass over the node.
const resolveNegation = (ast: Record<string, unknown> | undefined, schemaUri: string): { excluded?: Set<string>; excludedTypes?: Set<string> } => {
  const node = ast?.[schemaUri];
  if (!Array.isArray(node)) {
    return {};
  }
  const excluded = new Set<string>();
  let excludedTypes: Set<string> | undefined;
  for (const [keywordId, , keywordValue] of node as [string, unknown, unknown][]) {
    if (keywordId === "https://json-schema.org/keyword/const") {
      excluded.add(keywordValue as string);
    } else if (keywordId === "https://json-schema.org/keyword/enum") {
      for (const value of keywordValue as string[]) {
        excluded.add(value);
      }
    } else if (keywordId === "https://json-schema.org/keyword/type") {
      excludedTypes = new Set(typeList(keywordValue as string | string[]));
    }
  }
  return { excluded: excluded.size > 0 ? excluded : undefined, excludedTypes };
};

const resolveValueInfo = (ast: Record<string, unknown> | undefined, schemaUri: string, visited: Set<string> = new Set()): PropertyValueInfo => {
  try {
    let info: PropertyValueInfo = {};
    const node = ast?.[schemaUri];
    if (!Array.isArray(node) || visited.has(schemaUri)) {
      return info;
    }

    const path = new Set(visited).add(schemaUri);
    // A combinator in a property's value schema isn't evaluated while that value is still unwritten, so no hook sees it so we resolve it here.
    const nestedInfos: PropertyValueInfo[] = [];
    let enumValues: string[] | undefined;
    let enumDescriptions: string[] | undefined;

    for (const [keywordId, , keywordValue] of node as [string, unknown, unknown][]) {
      if (keywordId === "https://json-schema.org/keyword/type") {
        info.type = new Set(typeList(keywordValue as string | string[]));
      } else if (keywordId === "https://json-schema.org/keyword/enum") {
        enumValues = keywordValue as string[];
        info.enum = new Set(enumValues);
      } else if (keywordId === "https://json-schema.org/keyword/unknown#enumDescriptions") {
        enumDescriptions = (keywordValue as [string, string[]])[1];
      } else if (keywordId === "https://json-schema.org/keyword/const") {
        info.const = keywordValue as string;
      } else if (keywordId === "https://json-schema.org/keyword/not") {
        ({ excluded: info.excluded, excludedTypes: info.excludedTypes } = resolveNegation(ast, keywordValue as string));
      } else if (keywordId === "https://json-schema.org/keyword/allOf") {
        const branches = (keywordValue as string[]).map((branchUri) => resolveValueInfo(ast, branchUri, path));
        if (branches.length > 0) {
          nestedInfos.push(branches.reduce((merged, incoming) => intersectValueInfo(merged, incoming)));
        }
      } else if (keywordId === "https://json-schema.org/keyword/anyOf") {
        const branches = (keywordValue as string[]).map((branchUri) => resolveValueInfo(ast, branchUri, path));
        if (branches.length > 0) {
          nestedInfos.push(branches.reduce((merged, incoming) => unionValueInfo(merged, incoming)));
        }
      } else if (keywordId === "https://json-schema.org/keyword/oneOf") {
        const branches = (keywordValue as string[]).map((branchUri) => resolveValueInfo(ast, branchUri, path));
        if (branches.length > 0) {
          nestedInfos.push(exactlyOneValueInfo(branches));
        }
      }
    }

    if (enumValues && enumDescriptions) {
      info.enumDescriptions = new Map();
      for (const [index, value] of enumValues.entries()) {
        if (typeof enumDescriptions[index] === "string") {
          info.enumDescriptions.set(value, enumDescriptions[index]);
        }
      }
    }

    info = dropContradictoryValues(info);

    if (nestedInfos.length > 0) {
      const combined = nestedInfos.reduce((merged, incoming) => intersectValueInfo(merged, incoming));
      return isUnconstrained(info) ? combined : intersectValueInfo(info, combined);
    }
    return info;
  } catch {
    return {};
  }
};
