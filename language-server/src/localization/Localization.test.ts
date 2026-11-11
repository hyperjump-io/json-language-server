import { describe, test, expect } from "vitest";
import { Localization } from "./Localization.ts";

import type { SyntaxError, SyntaxErrorCode } from "../parser/parse.ts";

describe("Localization", () => {
  describe("forLocale", () => {
    test("defaults to en-US", () => {
      expect(Localization.forLocale().locale).to.equal("en-US");
    });

    test("uses the given locale when it is supported", () => {
      expect(Localization.forLocale("en-US").locale).to.equal("en-US");
    });

    test("falls back to en-US when the locale is not supported", () => {
      expect(Localization.forLocale("xx-XX").locale).to.equal("en-US");
    });

    test("reuses the localization for a locale", () => {
      expect(Localization.forLocale("en-US")).to.equal(Localization.forLocale("en-US"));
    });
  });

  describe("getSyntaxErrorMessage", () => {
    const localization = Localization.forLocale("en-US");

    const messages: Record<SyntaxErrorCode, string> = {
      "property-key-not-quoted": "Property names must be in double quotes",
      "property-key-single-quoted": "Property names must use double quotes instead of single quotes",
      "property-key-expected": "Expected a property name",
      "string-single-quoted": "Strings must use double quotes instead of single quotes",
      "comma-expected": "Expected a comma",
      "colon-expected": "Expected a colon",
      "value-expected": "Expected a value",
      "brace-not-closed": "Object is missing its closing brace",
      "bracket-not-closed": "Array is missing its closing bracket",
      "string-not-closed": "String is missing its closing quote",
      "invalid-escape": "Invalid escape sequence",
      "invalid-character": "Control characters are not allowed in strings",
      "number-invalid": "'01' is not a valid number",
      "comment-not-closed": "Comment is missing its closing '*/'",
      "invalid-literal": "'01' is not a valid value",
      "unexpected-token": "Unexpected '01'",
      "end-of-file-expected": "Expected the end of the file"
    };

    test.each(Object.entries(messages))("%s", (code, message) => {
      const error = { code, offset: 0, length: 1, data: { found: "01" } } as SyntaxError;
      expect(localization.getSyntaxErrorMessage(error)).to.equal(message);
    });

    test("an error code without a message uses the unknown message", () => {
      const error = { code: "not-a-real-code", offset: 0, length: 1 } as unknown as SyntaxError;
      expect(localization.getSyntaxErrorMessage(error)).to.equal("Syntax error 'not-a-real-code'");
    });
  });

  describe("getMessage", () => {
    const localization = Localization.forLocale("en-US");

    test("a message", () => {
      expect(localization.getMessage("trailing-comma")).to.equal("Trailing commas are not allowed");
    });

    test("a message id without a message uses the id", () => {
      expect(localization.getMessage("not-a-real-message")).to.equal("not-a-real-message");
    });
  });
});
