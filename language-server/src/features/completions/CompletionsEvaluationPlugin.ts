import type { EvaluationPlugin, Keyword, Node, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";

export class CompletionsEvaluationPlugin implements EvaluationPlugin {
  beforeSchema(_url: string, _instance: JsonNode, _context: ValidationContext): void {
  }

  beforeKeyword(_keywordNode: Node<unknown>, _instance: JsonNode, _context: ValidationContext, _schemaContext: ValidationContext, _keyword: Keyword<unknown>): void {
  }

  afterKeyword(_keywordNode: Node<unknown>, _instance: JsonNode, _context: ValidationContext, _valid: boolean, _schemaContext: ValidationContext, _keyword: Keyword<unknown>): void {
  }

  afterSchema(_url: string, _instance: JsonNode, _context: ValidationContext, _valid: boolean): void {
  }
}
