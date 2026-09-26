import * as jsonc from "jsonc-parser";

import type { Node, NodeType } from "jsonc-parser";

export type SyntaxErrorCode
  = "trailing-comma"
    | "property-key-not-quoted"
    | "property-key-single-quoted"
    | "string-single-quoted"
    | "comma-expected"
    | "colon-expected"
    | "value-expected"
    | "brace-not-closed"
    | "bracket-not-closed"
    | "string-not-closed"
    | "invalid-escape"
    | "invalid-character"
    | "number-invalid"
    | "comment-not-allowed"
    | "comment-not-closed"
    | "invalid-literal"
    | "end-of-file-expected";

export type SyntaxError = {
  code: SyntaxErrorCode;
  offset: number;
  length: number;
  data?: Record<string, string>;
};

export type ParseResult = {
  root: Node | undefined;
  errors: SyntaxError[];
};

export type ParseOptions = {
  allowComments?: boolean;
};

type MutableNode = {
  -readonly [K in keyof Node]: Node[K];
};

const NUMBER_TERMINATORS = new Set([",", ":", "{", "}", "[", "]", "\"", "/"]);

const endsNumber = (character: string) => {
  return NUMBER_TERMINATORS.has(character) || character.trim() === "";
};

const VALID_ESCAPES = new Set(["\"", "\\", "/", "b", "f", "n", "r", "t", "u"]);

export const parse = (text: string, options: ParseOptions = {}): ParseResult => {
  const scanner = jsonc.createScanner(text, false);
  const errors: SyntaxError[] = [];
  let ranToEndOfFile = false;

  let kindState: jsonc.SyntaxKind = jsonc.SyntaxKind.Unknown;
  let offset = 0;
  let length = 0;
  let tokenValue = "";
  let previousOffset = 0;
  let previousLength = 0;

  const kind = () => kindState;

  const report = (code: SyntaxErrorCode, errorOffset: number, errorLength: number, data?: Record<string, string>) => {
    const error: SyntaxError = { code, offset: errorOffset, length: errorLength };
    if (data) {
      error.data = data;
    }
    errors.push(error);
  };

  const reportAtPrevious = (code: SyntaxErrorCode) => {
    report(code, previousOffset, Math.max(previousLength, 1));
  };

  const raw = () => {
    return text.slice(offset, offset + length);
  };

  const reportScanError = (scanError: jsonc.ScanError) => {
    switch (scanError) {
      case jsonc.ScanError.None:
        return;

      case jsonc.ScanError.UnexpectedEndOfString:
        report("string-not-closed", offset, length);
        ranToEndOfFile = offset + length === text.length;
        return;

      case jsonc.ScanError.InvalidEscapeCharacter:
      case jsonc.ScanError.InvalidUnicode:
        report("invalid-escape", offset + invalidEscapeIndex(raw()), 2);
        return;

      case jsonc.ScanError.InvalidCharacter:
        report("invalid-character", offset + controlCharacterIndex(raw()), 1);
        return;

      case jsonc.ScanError.UnexpectedEndOfNumber:
        report("number-invalid", offset, length, { found: raw() });
        return;

      case jsonc.ScanError.UnexpectedEndOfComment:
        report("comment-not-closed", offset, length);
        ranToEndOfFile = true;
        return;

      default:
        return assertHandled(scanError);
    }
  };

  const absorbInvalidNumber = () => {
    let end = offset + length;
    if (end >= text.length || endsNumber(text[end])) {
      return;
    }

    while (end < text.length && !endsNumber(text[end])) {
      end++;
    }

    length = end - offset;
    tokenValue = raw();
    report("number-invalid", offset, length, { found: raw() });
    scanner.setPosition(end);
  };

  const skipComment = (scanError: jsonc.ScanError) => {
    if (options.allowComments) {
      reportScanError(scanError);
      return;
    }

    report("comment-not-allowed", offset, length);
    if (scanError === jsonc.ScanError.UnexpectedEndOfComment) {
      ranToEndOfFile = true;
    }
  };

  const next = () => {
    previousOffset = offset;
    previousLength = length;

    for (;;) {
      kindState = scanner.scan();
      offset = scanner.getTokenOffset();
      length = scanner.getTokenLength();
      tokenValue = scanner.getTokenValue();
      const scanError = scanner.getTokenError();

      switch (kind()) {
        case jsonc.SyntaxKind.Trivia:
        case jsonc.SyntaxKind.LineBreakTrivia:
          continue;

        case jsonc.SyntaxKind.LineCommentTrivia:
        case jsonc.SyntaxKind.BlockCommentTrivia:
          skipComment(scanError);
          continue;
      }

      reportScanError(scanError);

      if (kind() === jsonc.SyntaxKind.NumericLiteral && scanError === jsonc.ScanError.None) {
        absorbInvalidNumber();
      }

      return;
    }
  };

  const node = (type: NodeType, nodeOffset: number, parent?: MutableNode): MutableNode => {
    return { type, offset: nodeOffset, length: 0, parent };
  };

  const finish = (target: MutableNode, end: number) => {
    target.length = end - target.offset;
    return target;
  };

  const reportNotClosed = (code: SyntaxErrorCode, container: MutableNode, openOffset: number) => {
    if (ranToEndOfFile) {
      return;
    }

    const lastItem = container.children?.at(-1);
    if (lastItem) {
      report(code, lastItem.offset, lastItem.length);
    } else {
      report(code, openOffset, 1);
    }
  };

  const reportMissing = () => {
    if (kind() === jsonc.SyntaxKind.CommaToken) {
      reportAtPrevious("value-expected");
    } else {
      report("value-expected", offset, Math.max(length, 1));
    }
  };

  const parseString = (parent?: MutableNode) => {
    const result = node("string", offset, parent);
    result.value = tokenValue;
    finish(result, offset + length);
    next();
    return result;
  };

  const parseLiteral = (parent?: MutableNode): MutableNode => {
    const type: NodeType = kind() === jsonc.SyntaxKind.NumericLiteral ? "number" : kind() === jsonc.SyntaxKind.NullKeyword ? "null" : "boolean";
    const result = node(type, offset, parent);

    if (type === "number") {
      const parsed = Number(raw());
      result.value = isNaN(parsed) ? 0 : parsed;
    } else if (type === "boolean") {
      result.value = kind() === jsonc.SyntaxKind.TrueKeyword;
    } else {
      result.value = null;
    }

    finish(result, offset + length);
    next();
    return result;
  };

  const parseUnknownAsString = (code: SyntaxErrorCode, parent?: MutableNode) => {
    report(code, offset, length);
    const result = node("string", offset, parent);
    result.value = raw().replace(/^'|'$/g, "");
    finish(result, offset + length);
    next();
    return result;
  };

  const parseProperty = (parent: MutableNode): MutableNode | undefined => {
    const property = node("property", offset, parent);
    property.children = [];

    if (kind() === jsonc.SyntaxKind.Unknown) {
      const code = raw().startsWith("'") ? "property-key-single-quoted" : "property-key-not-quoted";
      property.children.push(parseUnknownAsString(code, property));
    } else if (kind() === jsonc.SyntaxKind.StringLiteral) {
      property.children.push(parseString(property));
    } else {
      return undefined;
    }

    if (kind() === jsonc.SyntaxKind.ColonToken) {
      property.colonOffset = offset;
      next();
    } else {
      reportAtPrevious("colon-expected");
    }

    const value = parseValue(property);
    if (value) {
      property.children.push(value);
      finish(property, value.offset + value.length);
    } else {
      reportAtPrevious("value-expected");
      finish(property, scanner.getPosition());
    }

    return property;
  };

  const parseObject = (parent?: MutableNode): MutableNode => {
    const object = node("object", offset, parent);
    object.children = [];
    const openOffset = offset;
    next();

    while (kind() !== jsonc.SyntaxKind.CloseBraceToken && kind() !== jsonc.SyntaxKind.EOF && kind() !== jsonc.SyntaxKind.CloseBracketToken) {
      const property = parseProperty(object);
      if (!property) {
        reportMissing();
        if (kind() !== jsonc.SyntaxKind.CommaToken) {
          break;
        }
        next();
        continue;
      }
      object.children.push(property);

      if (kind() === jsonc.SyntaxKind.CommaToken) {
        const commaOffset = offset;
        next();
        if (kind() === jsonc.SyntaxKind.CloseBraceToken) {
          report("trailing-comma", commaOffset, 1);
        }
      } else if (kind() !== jsonc.SyntaxKind.CloseBraceToken && kind() !== jsonc.SyntaxKind.EOF && kind() !== jsonc.SyntaxKind.CloseBracketToken) {
        reportAtPrevious("comma-expected");
      }
    }

    if (kind() !== jsonc.SyntaxKind.CloseBraceToken) {
      reportNotClosed("brace-not-closed", object, openOffset);
      return finish(object, offset);
    }

    const end = offset + length;
    next();
    return finish(object, end);
  };

  const parseArray = (parent?: MutableNode): MutableNode => {
    const array = node("array", offset, parent);
    array.children = [];
    const openOffset = offset;
    next();

    while (kind() !== jsonc.SyntaxKind.CloseBracketToken && kind() !== jsonc.SyntaxKind.EOF && kind() !== jsonc.SyntaxKind.CloseBraceToken) {
      const item = parseValue(array);
      if (!item) {
        reportMissing();
        if (kind() !== jsonc.SyntaxKind.CommaToken) {
          break;
        }
        next();
        continue;
      }
      array.children.push(item);

      if (kind() === jsonc.SyntaxKind.CommaToken) {
        const commaOffset = offset;
        next();
        if (kind() === jsonc.SyntaxKind.CloseBracketToken) {
          report("trailing-comma", commaOffset, 1);
        }
      } else if (kind() !== jsonc.SyntaxKind.CloseBracketToken && kind() !== jsonc.SyntaxKind.EOF && kind() !== jsonc.SyntaxKind.CloseBraceToken) {
        reportAtPrevious("comma-expected");
      }
    }

    if (kind() !== jsonc.SyntaxKind.CloseBracketToken) {
      reportNotClosed("bracket-not-closed", array, openOffset);
      return finish(array, offset);
    }

    const end = offset + length;
    next();
    return finish(array, end);
  };

  const parseValue = (parent?: MutableNode): MutableNode | undefined => {
    switch (kind()) {
      case jsonc.SyntaxKind.OpenBraceToken:
        return parseObject(parent);

      case jsonc.SyntaxKind.OpenBracketToken:
        return parseArray(parent);

      case jsonc.SyntaxKind.StringLiteral:
        return parseString(parent);

      case jsonc.SyntaxKind.NumericLiteral:
      case jsonc.SyntaxKind.TrueKeyword:
      case jsonc.SyntaxKind.FalseKeyword:
      case jsonc.SyntaxKind.NullKeyword:
        return parseLiteral(parent);

      case jsonc.SyntaxKind.Unknown: {
        if (raw().startsWith("'")) {
          return parseUnknownAsString("string-single-quoted", parent);
        }

        report("invalid-literal", offset, length, { found: raw() });
        const result = node("null", offset, parent);
        result.value = null;
        finish(result, offset + length);
        next();
        return result;
      }

      default:
        return undefined;
    }
  };

  next();

  if (kind() === jsonc.SyntaxKind.EOF) {
    report("value-expected", 0, 0);
    return { root: undefined, errors };
  }

  const root = parseValue();

  if (kind() !== jsonc.SyntaxKind.EOF) {
    report("end-of-file-expected", offset, Math.max(text.trimEnd().length - offset, 1));
  }

  return { root, errors };
};

const assertHandled = (scanError: never) => {
  throw new Error(`Unhandled scan error: ${String(scanError)}`);
};

const controlCharacterIndex = (token: string) => {
  for (let index = 0; index < token.length; index++) {
    if (token.charCodeAt(index) < 0x20) {
      return index;
    }
  }

  return 0;
};

const invalidEscapeIndex = (token: string) => {
  for (let index = 0; index < token.length - 1; index++) {
    if (token[index] !== "\\") {
      continue;
    }

    if (!VALID_ESCAPES.has(token[index + 1])) {
      return index;
    }

    index++;
  }

  return 0;
};
