import { describe, test, expect } from "vitest";
import { parse } from "./parse.ts";

describe("parse", () => {
  test("a valid document has no errors", () => {
    const { errors } = parse(`{ "a": 1 }`);

    expect(errors).toEqual([]);
  });

  test("a trailing comma in an object points at the comma", () => {
    const { errors } = parse(`{ "a": 1, }`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 8, length: 1 }
    ]);
  });

  test("a trailing comma in an array points at the comma", () => {
    const { errors } = parse(`[1, 2, ]`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 5, length: 1 }
    ]);
  });

  test("an unquoted property key points at the key", () => {
    const { errors } = parse(`{ a: 1 }`);

    expect(errors).toEqual([
      { code: "property-key-not-quoted", offset: 2, length: 1 }
    ]);
  });

  test("a single quoted property key points at the key", () => {
    const { errors } = parse(`{ 'a': 1 }`);

    expect(errors).toEqual([
      { code: "property-key-single-quoted", offset: 2, length: 3 }
    ]);
  });

  test("a single quoted string value points at the value", () => {
    const { errors } = parse(`{ "a": 'x' }`);

    expect(errors).toEqual([
      { code: "string-single-quoted", offset: 7, length: 3 }
    ]);
  });

  test("a missing comma points at the value it should follow", () => {
    const { errors } = parse(`{
      "a": 1
      "b": 2
    }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 13, length: 1 }
    ]);
  });

  test("a missing colon points at the key it should follow", () => {
    const { errors } = parse(`{ "a" 1 }`);

    expect(errors).toEqual([
      { code: "colon-expected", offset: 2, length: 3 }
    ]);
  });

  test("a property name with nothing after it is missing both a colon and a value", () => {
    const { errors } = parse(`{"a"}`);

    expect(errors).toEqual([
      { code: "colon-expected", offset: 1, length: 3 },
      { code: "value-expected", offset: 1, length: 3 }
    ]);
  });

  test("a property with no value points at the colon rather than the next line", () => {
    const { errors } = parse(`{
      "a":
    }`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 11, length: 1 }
    ]);
  });

  test("an unclosed object points at its last property", () => {
    const { errors } = parse(`{
      "a": 1,
      "b": 2`);

    expect(errors).toEqual([
      { code: "brace-not-closed", offset: 22, length: 6 }
    ]);
  });

  test("an unclosed empty object points at the opening brace", () => {
    const { errors } = parse(`{`);

    expect(errors).toEqual([
      { code: "brace-not-closed", offset: 0, length: 1 }
    ]);
  });

  test("an unclosed array points at its last item", () => {
    const { errors } = parse(`{ "a": [1, 2 }`);

    expect(errors).toEqual([
      { code: "bracket-not-closed", offset: 11, length: 1 }
    ]);
  });

  test("an unclosed empty array points at the opening bracket", () => {
    const { errors } = parse(`{ "a": [ }`);

    expect(errors).toEqual([
      { code: "bracket-not-closed", offset: 7, length: 1 }
    ]);
  });

  test("an unterminated string points at the string", () => {
    const { errors } = parse(`{ "a": "x }`);

    expect(errors).toEqual([
      { code: "string-not-closed", offset: 7, length: 4 }
    ]);
  });

  test("an invalid escape points at the escape sequence", () => {
    const { errors } = parse(`{ "a": "x\\q" }`);

    expect(errors).toEqual([
      { code: "invalid-escape", offset: 9, length: 2 }
    ]);
  });

  test("a number with a leading zero is invalid", () => {
    const { errors } = parse(`{ "a": 01 }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 2, data: { found: "01" } }
    ]);
  });

  test("a padded number reports once across the whole run", () => {
    const { errors } = parse(`{ "a": 007 }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 3, data: { found: "007" } }
    ]);
  });

  test("a number with two decimal points reports once", () => {
    const { errors } = parse(`{ "a": 1.2.3 }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 5, data: { found: "1.2.3" } }
    ]);
  });

  test("hex notation is not a valid JSON number", () => {
    const { errors } = parse(`{ "a": 0x1F }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 4, data: { found: "0x1F" } }
    ]);
  });

  test("digit separators are not valid JSON numbers", () => {
    const { errors } = parse(`{ "a": 1_000 }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 5, data: { found: "1_000" } }
    ]);
  });

  test("NaN is reported as an invalid literal", () => {
    const { errors } = parse(`{ "a": NaN }`);

    expect(errors).toEqual([
      { code: "invalid-literal", offset: 7, length: 3, data: { found: "NaN" } }
    ]);
  });

  test("a capitalised boolean is reported as an invalid literal", () => {
    const { errors } = parse(`{ "a": True }`);

    expect(errors).toEqual([
      { code: "invalid-literal", offset: 7, length: 4, data: { found: "True" } }
    ]);
  });

  test("a control character inside a string points at the character", () => {
    const { errors } = parse(`{ "a": "x\ty" }`);

    expect(errors).toEqual([
      { code: "invalid-character", offset: 9, length: 1 }
    ]);
  });

  test("a number that stops after the decimal point is invalid", () => {
    const { errors } = parse(`{ "a": 1. }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 2, data: { found: "1." } }
    ]);
  });

  test("a number that stops after the exponent is invalid", () => {
    const { errors } = parse(`{ "a": 1e }`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 7, length: 2, data: { found: "1e" } }
    ]);
  });

  test("everything after the end of the document is reported", () => {
    const { errors } = parse(`{
      "a": 1
    }
    {
      "b": 2
    }`);

    expect(errors).toEqual([
      { code: "end-of-file-expected", offset: 25, length: 20 }
    ]);
  });

  test("trailing whitespace is not part of the content after the document", () => {
    const { errors } = parse(`{
      "a": 1
    }
    {
      "b": 2
    }
    `);

    expect(errors).toEqual([
      { code: "end-of-file-expected", offset: 25, length: 20 }
    ]);
  });
});

describe("recovery", () => {
  test("a trailing comma inside a nested object is reported once", () => {
    const { errors } = parse(`{
      "a": {
        "b": 1,
      }
    }`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 29, length: 1 }
    ]);
  });

  test("a trailing comma inside a nested array is reported once", () => {
    const { errors } = parse(`{ "a": [1, 2,], "b": 3 }`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 12, length: 1 }
    ]);
  });

  test("three mistakes in one object give three errors", () => {
    const { errors } = parse(`{
      a: 1,
      "b" 2,
      'c': 3
    }`);

    expect(errors).toEqual([
      { code: "property-key-not-quoted", offset: 8, length: 1 },
      { code: "colon-expected", offset: 20, length: 3 },
      { code: "property-key-single-quoted", offset: 33, length: 3 }
    ]);
  });

  test("a doubled comma between properties is reported once", () => {
    const { errors } = parse(`{ "a": 1,, "b": 2 }`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 8, length: 1 }
    ]);
  });

  test("a gap between array items is reported once", () => {
    const { errors } = parse(`[1, , 2]`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 2, length: 1 }
    ]);
  });

  test("each single quoted array item is reported separately", () => {
    const { errors } = parse(`['a', 'b']`);

    expect(errors).toEqual([
      { code: "string-single-quoted", offset: 1, length: 3 },
      { code: "string-single-quoted", offset: 6, length: 3 }
    ]);
  });

  test("an invalid number inside an array points at the number", () => {
    const { errors } = parse(`[01, 2]`);

    expect(errors).toEqual([
      { code: "number-invalid", offset: 1, length: 2, data: { found: "01" } }
    ]);
  });

  test("an invalid literal inside an array carries the text found", () => {
    const { errors } = parse(`[NaN, 1]`);

    expect(errors).toEqual([
      { code: "invalid-literal", offset: 1, length: 3, data: { found: "NaN" } }
    ]);
  });

  test("a number directly against a string is three separate mistakes", () => {
    const { errors } = parse(`{ "a": 1"b" }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 7, length: 1 },
      { code: "colon-expected", offset: 8, length: 3 },
      { code: "value-expected", offset: 8, length: 3 }
    ]);
  });

  test("a missing value deep inside nested containers is reported once", () => {
    const { errors } = parse(`{
      "a": [
        {
          "b":
        }
      ]
    }`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 38, length: 1 }
    ]);
  });

  test("an unclosed outer object is reported once when the inner one closes", () => {
    const { errors } = parse(`{
      "a": {
        "b": 1
      }`);

    expect(errors).toEqual([
      { code: "brace-not-closed", offset: 8, length: 29 }
    ]);
  });

  test("an unterminated string that runs to the end of the document does not also report the containers", () => {
    const { errors } = parse(`{ "a": { "b": "x } }`);

    expect(errors).toEqual([
      { code: "string-not-closed", offset: 14, length: 6 }
    ]);
  });

  test("a mistake after a well formed nested object is still found", () => {
    const { errors } = parse(`{
      "a": {
        "b": 1
      },
      c: 2
    }`);

    expect(errors).toEqual([
      { code: "property-key-not-quoted", offset: 45, length: 1 }
    ]);
  });

  test("two trailing commas in different containers are both reported", () => {
    const { errors } = parse(`{
      "a": [1,],
      "b": {
        "c": 1,
      }
    }`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 15, length: 1 },
      { code: "trailing-comma", offset: 46, length: 1 }
    ]);
  });

  test("a truncated document reports every container left open", () => {
    const { errors } = parse(`{
      "a": {
        "b": {
          "c": [1, 2`);

    expect(errors).toEqual([
      { code: "bracket-not-closed", offset: 49, length: 1 },
      { code: "brace-not-closed", offset: 40, length: 10 },
      { code: "brace-not-closed", offset: 23, length: 27 },
      { code: "brace-not-closed", offset: 8, length: 42 }
    ]);
  });

  test("an unterminated string that ends at a newline does not hide a later unclosed array", () => {
    const { errors } = parse(`{
      "a": "x
      "b": [1, 2
    }`);

    expect(errors).toEqual([
      { code: "string-not-closed", offset: 13, length: 2 },
      { code: "comma-expected", offset: 13, length: 2 },
      { code: "bracket-not-closed", offset: 31, length: 1 }
    ]);
  });

  test("recovery keeps the rest of the tree usable", () => {
    const { root } = parse(`{
      a: 1,
      "b" 2,
      'c': 3
    }`);

    expect(root?.children?.length).toBe(3);
    expect(root?.children?.map((property) => property.children?.[0].value)).toEqual(["a", "b", "c"]);
  });

  test("a comma-only array reports trailing-comma on the comma", () => {
    const { errors } = parse(`[,]`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 1, length: 1 }
    ]);
  });

  test("a deleted closing line produces minimal errors", () => {
    const { errors } = parse(`{
      "a": 1,
      "b": [
        2
      "c": 3
    }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 37, length: 1 },
      { code: "bracket-not-closed", offset: 37, length: 1 }
    ]);
  });

  test("an unclosed array followed by a property produces minimal errors", () => {
    const { errors } = parse(`{
      "a": 1,
      "b": [ 2
      "c": 3
    }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 29, length: 1 },
      { code: "bracket-not-closed", offset: 29, length: 1 }
    ]);
  });

  test("a comma-only object reports trailing-comma on the comma", () => {
    const { errors } = parse(`{,}`);

    expect(errors).toEqual([
      { code: "trailing-comma", offset: 1, length: 1 }
    ]);
  });

  test("a leading comma in an array points at the bracket the value should follow", () => {
    const { errors } = parse(`[, 1]`);

    expect(errors).toEqual([
      { code: "value-expected", offset: 0, length: 1 }
    ]);
  });

  test("an empty unclosed array followed by a property is reported once", () => {
    const { errors } = parse(`{
      "a": [
      "b": 1
    }`);

    expect(errors).toEqual([
      { code: "bracket-not-closed", offset: 13, length: 1 }
    ]);
  });

  test("nested unclosed arrays followed by a property report the missing comma once", () => {
    const { errors } = parse(`{
      "a": [
        [ 1
      "b": 2
    }`);

    expect(errors).toEqual([
      { code: "comma-expected", offset: 25, length: 1 },
      { code: "bracket-not-closed", offset: 25, length: 1 },
      { code: "bracket-not-closed", offset: 23, length: 3 }
    ]);
  });

  test("an unclosed array does not hide a later missing comma", () => {
    const { errors } = parse(`{ "x": { "a": [1 }, "b": 1 "c": 2 }`);

    expect(errors).toEqual([
      { code: "bracket-not-closed", offset: 15, length: 1 },
      { code: "comma-expected", offset: 25, length: 1 }
    ]);
  });

  test("a comment between a property name and its colon does not hide the property", () => {
    const { errors } = parse(`{
      "a": [ 1
      "b" /* x */: 2
    }`, { allowComments: true });

    expect(errors).toEqual([
      { code: "comma-expected", offset: 15, length: 1 },
      { code: "bracket-not-closed", offset: 15, length: 1 }
    ]);
  });
});

describe("comments", () => {
  test("a line comment is not allowed in JSON", () => {
    const { errors } = parse(`{
      // hi
      "a": 1
    }`);

    expect(errors).toEqual([
      { code: "comment-not-allowed", offset: 8, length: 5 }
    ]);
  });

  test("a block comment is not allowed in JSON", () => {
    const { errors } = parse(`{ /* hi */ "a": 1 }`);

    expect(errors).toEqual([
      { code: "comment-not-allowed", offset: 2, length: 8 }
    ]);
  });

  test("comments are allowed in JSONC", () => {
    const { errors } = parse(`{
      // hi
      "a": /* one */ 1
    }`, { allowComments: true });

    expect(errors).toEqual([]);
  });

  test("an unclosed block comment in JSONC is reported once", () => {
    const { errors } = parse(`{ "a": 1 /* hi }`, { allowComments: true });

    expect(errors).toEqual([
      { code: "comment-not-closed", offset: 9, length: 7 }
    ]);
  });

  test("an unclosed block comment in JSON is only reported as not allowed", () => {
    const { errors } = parse(`{ "a": 1 /* hi }`);

    expect(errors).toEqual([
      { code: "comment-not-allowed", offset: 9, length: 7 }
    ]);
  });

  test("a comment directly after a number does not make the number invalid", () => {
    const { errors } = parse(`{ "a": 1/* one */ }`, { allowComments: true });

    expect(errors).toEqual([]);
  });
});
