import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";
import type { Node, Keyword } from "@hyperjump/json-schema/experimental";

type Annotation = Record<string, unknown>;

type AnnotationContext = ValidationContext & {
  pendingAnnotations?: Annotation;
};

export class AnnotationEvaluationPlugin implements EvaluationPlugin {
  private annotations: Map<string, Annotation[]> = new Map();

  beforeSchema(_url: string, _instance: JsonNode, context: AnnotationContext): void {
    context.pendingAnnotations = {};
  }

  afterKeyword(node: Node<unknown>, instance: JsonNode, context: AnnotationContext, _valid: boolean, schemaContext: AnnotationContext, keyword: Keyword<unknown>): void {
    const [keywordId, , keywordValue] = node;

    if (keyword.annotation) {
      schemaContext.pendingAnnotations ??= {};
      schemaContext.pendingAnnotations[keywordId] = keyword.annotation(keywordValue, instance, context);
    }
  }

  afterSchema(_schemaUri: string, instance: JsonNode, context: AnnotationContext, valid: boolean): void {
    if (valid && context.pendingAnnotations) {
      if (!this.annotations.has(instance.pointer)) {
        this.annotations.set(instance.pointer, []);
      }

      const existing = this.annotations.get(instance.pointer)!;
      existing.push(context.pendingAnnotations);
    }
  }

  getAnnotations(instanceLocation: string): Annotation[] {
    return this.annotations.get(instanceLocation) ?? [];
  }
}
