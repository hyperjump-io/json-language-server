import type { EvaluationPlugin, ValidationContext } from "@hyperjump/json-schema/experimental";
import type { JsonNode } from "@hyperjump/json-schema/instance/experimental";

const supportedErrorMessageKeywords = new Set([
  "https://json-schema.org/keyword/type",
  "https://json-schema.org/keyword/enum",
  "https://json-schema.org/keyword/const"
]);

const supportedPatternErrorMessageKeywords = new Set([
  "https://json-schema.org/keyword/pattern",
  "https://json-schema.org/keyword/draft-04/format",
  "https://json-schema.org/keyword/draft-06/format",
  "https://json-schema.org/keyword/draft-07/format",
  "https://json-schema.org/keyword/draft-2019-09/format",
  "https://json-schema.org/keyword/draft-2019-09/format-assertion",
  "https://json-schema.org/keyword/draft-2020-12/format",
  "https://json-schema.org/keyword/draft-2020-12/format-assertion"
]);

export class ErrorMessageEvaluationPlugin implements EvaluationPlugin {
  static readonly id = "error-message";

  private messages: Map<string, string> = new Map();

  beforeSchema(url: string, _instance: JsonNode, context: ValidationContext): void {
    const nodes = context.ast[url];
    if (!Array.isArray(nodes)) {
      return;
    }

    let errorMessage: string | undefined;
    let patternErrorMessage: string | undefined;

    for (const [keywordId, , keywordValue] of nodes) {
      if (keywordId === "https://microsoft.com/keyword/errorMessage" || keywordId === "https://json-schema.org/keyword/unknown#errorMessage") {
        const message = extractStringValue(keywordId, keywordValue);
        if (message !== undefined) {
          errorMessage = message;
        }
      }
      if (keywordId === "https://microsoft.com/keyword/patternErrorMessage" || keywordId === "https://json-schema.org/keyword/unknown#patternErrorMessage") {
        const message = extractStringValue(keywordId, keywordValue);
        if (message !== undefined) {
          patternErrorMessage = message;
        }
      }
    }

    for (const [keywordId, keywordLocation] of nodes) {
      if (supportedErrorMessageKeywords.has(keywordId) && errorMessage !== undefined) {
        this.messages.set(keywordLocation, errorMessage);
      } else if (supportedPatternErrorMessageKeywords.has(keywordId)) {
        const message = patternErrorMessage ?? errorMessage;
        if (message !== undefined) {
          this.messages.set(keywordLocation, message);
        }
      }
    }
  }

  getMessage(schemaLocation: string): string | undefined {
    return this.messages.get(schemaLocation);
  }
}

function extractStringValue(keywordId: string, keywordValue: unknown): string | undefined {
  const isUnknown = keywordId === "https://json-schema.org/keyword/unknown#errorMessage" || keywordId === "https://json-schema.org/keyword/unknown#patternErrorMessage";
  const value = isUnknown && Array.isArray(keywordValue) ? keywordValue[1] : keywordValue;
  return typeof value === "string" ? value : undefined;
}
