import * as jsonc from "jsonc-parser";

import type { Node, NodeType } from "jsonc-parser";

export type SyntaxErrorCode
  = "trailing-comma"
    | "property-key-not-quoted"
    | "property-key-single-quoted"
    | "property-key-expected"
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
    | "unexpected-token"
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
  comments: Array<{ offset: number; length: number }>;
  trailingCommas: Array<{ offset: number; length: number }>;
};

type MutableNode = {
  -readonly [K in keyof Node]: Node[K];
};

type Separator = {
  after: MutableNode | undefined;
  offset: number;
  length: number;
};

const NUMBER_TERMINATORS = new Set([",", ":", "{", "}", "[", "]", "\"", "/"]);

const endsNumber = (character: string) => {
  return NUMBER_TERMINATORS.has(character) || character.trim() === "";
};

const VALID_ESCAPES = new Set(["\"", "\\", "/", "b", "f", "n", "r", "t", "u"]);

export const parse = (text: string): ParseResult => {
  const scanner = jsonc.createScanner(text, false);
  const errors: SyntaxError[] = [];
  const comments: Array<{ offset: number; length: number }> = [];
  const trailingCommas: Array<{ offset: number; length: number }> = [];
  let ranToEndOfFile = false;
  const unclosed = new WeakSet<MutableNode>();

  let kindState: jsonc.SyntaxKind = jsonc.SyntaxKind.Unknown;
  let offset = 0;
  let length = 0;
  let tokenValue = "";
  let previousOffset = 0;
  let previousLength = 0;

  const kind = () => kindState;

  const report = (code: SyntaxErrorCode, errorOffset: number, errorLength: number, data?: Record<string, string>) => {
    errors.push({ code, offset: errorOffset, length: errorLength, data });
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
      case jsonc.ScanError.InvalidUnicode: {
        const escape = invalidEscape(raw());
        report("invalid-escape", offset + escape.index, escape.length);
        return;
      }

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
    if (scanError === jsonc.ScanError.UnexpectedEndOfComment) {
      report("comment-not-closed", offset, length);
      ranToEndOfFile = true;
    }

    comments.push({ offset, length });
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
    unclosed.add(container);
    if (ranToEndOfFile) {
      return;
    }

    const lastItem = container.children?.at(-1);
    if (lastItem) {
      const lastItemText = text.slice(lastItem.offset, lastItem.offset + lastItem.length);
      report(code, lastItem.offset, lastItemText.trimEnd().length);
    } else {
      report(code, openOffset, 1);
    }
  };

  const reportCommaExpected = (separator: Separator) => {
    if (separator.after && !unclosed.has(separator.after)) {
      report("comma-expected", separator.offset, Math.max(separator.length, 1));
    }
  };

  const separatorAfter = (after: MutableNode | undefined): Separator => {
    return { after, offset: previousOffset, length: previousLength };
  };

  const skipStrayColons = () => {
    const start = offset;
    while (kind() === jsonc.SyntaxKind.ColonToken) {
      next();
    }

    const end = previousOffset + previousLength;
    report("unexpected-token", start, end - start, { found: text.slice(start, end) });
  };

  const looksLikeProperty = () => {
    if (kind() !== jsonc.SyntaxKind.StringLiteral) {
      return false;
    }

    const savedPosition = scanner.getPosition();
    let peekKind = scanner.scan();
    while (WHITESPACE_AND_COMMENTS.has(peekKind)) {
      peekKind = scanner.scan();
    }
    scanner.setPosition(savedPosition);

    return peekKind === jsonc.SyntaxKind.ColonToken;
  };

  const isEndOfContainer = () => {
    return kind() === jsonc.SyntaxKind.CloseBraceToken
      || kind() === jsonc.SyntaxKind.CloseBracketToken
      || kind() === jsonc.SyntaxKind.EOF;
  };

  const parseComma = (closer: jsonc.SyntaxKind, isExtra: boolean) => {
    const commaOffset = offset;
    const beforeOffset = previousOffset;
    const beforeLength = previousLength;
    next();

    if (kind() === closer) {
      trailingCommas.push({ offset: commaOffset, length: 1 });
    } else if (isExtra) {
      report("value-expected", beforeOffset, Math.max(beforeLength, 1));
    }
  };

  const parseScalar = (type: NodeType, value: unknown, parent?: MutableNode) => {
    const result = node(type, offset, parent);
    result.value = value;
    finish(result, offset + length);
    next();
    return result;
  };

  const parseTokenAsString = (code: SyntaxErrorCode, parent?: MutableNode) => {
    report(code, offset, length);
    return parseScalar("string", raw().replace(/^'|'$/g, ""), parent);
  };

  const parseProperty = (parent: MutableNode): MutableNode => {
    const property = node("property", offset, parent);
    property.children = [];

    const keyMissing = !KEY_STARTS.has(kind());
    if (keyMissing) {
      report("property-key-expected", offset, 1);
      const key = node("string", offset, property);
      key.value = "";
      property.children.push(key);
    } else if (kind() === jsonc.SyntaxKind.StringLiteral) {
      property.children.push(parseScalar("string", tokenValue, property));
    } else {
      if (errors.at(-1)?.code === "number-invalid" && errors.at(-1)?.offset === offset) {
        errors.pop();
      }
      const code = raw().startsWith("'") ? "property-key-single-quoted" : "property-key-not-quoted";
      property.children.push(parseTokenAsString(code, property));
    }

    if (kind() === jsonc.SyntaxKind.ColonToken) {
      property.colonOffset = offset;
      next();
      if (kind() === jsonc.SyntaxKind.ColonToken) {
        skipStrayColons();
      }
    } else if (!keyMissing) {
      reportAtPrevious("colon-expected");
    }

    const value = looksLikeProperty() ? undefined : parseValue(property);
    if (value) {
      property.children.push(value);
      finish(property, value.offset + value.length);
    } else {
      if (property.colonOffset === undefined) {
        reportAtPrevious("value-expected");
      } else {
        report("value-expected", property.colonOffset, 1);
      }
      finish(property, offset);
    }

    return property;
  };

  const parseContainer = (type: "object" | "array", parent?: MutableNode): MutableNode => {
    const container = node(type, offset, parent);
    container.children = [];
    const openOffset = offset;
    const closer = type === "object" ? jsonc.SyntaxKind.CloseBraceToken : jsonc.SyntaxKind.CloseBracketToken;
    next();

    let separator: Separator | undefined;
    while (!isEndOfContainer()) {
      if (kind() === jsonc.SyntaxKind.CommaToken) {
        parseComma(closer, !separator);
        separator = undefined;
        continue;
      }

      if (type === "array" && kind() === jsonc.SyntaxKind.ColonToken) {
        skipStrayColons();
        separator ??= separatorAfter(undefined);
        continue;
      }

      if (separator) {
        reportCommaExpected(separator);
      }

      if (type === "array" && looksLikeProperty()) {
        break;
      }

      const item = type === "object" ? parseProperty(container) : parseValue(container)!;
      container.children.push(item);
      separator = separatorAfter(type === "object" ? item.children?.[1] : item);
    }

    if (kind() !== closer) {
      reportNotClosed(type === "object" ? "brace-not-closed" : "bracket-not-closed", container, openOffset);
      return finish(container, offset);
    }

    const end = offset + length;
    next();
    return finish(container, end);
  };

  const parseValue = (parent?: MutableNode): MutableNode | undefined => {
    switch (kind()) {
      case jsonc.SyntaxKind.OpenBraceToken:
        return parseContainer("object", parent);

      case jsonc.SyntaxKind.OpenBracketToken:
        return parseContainer("array", parent);

      case jsonc.SyntaxKind.StringLiteral:
        return parseScalar("string", tokenValue, parent);

      case jsonc.SyntaxKind.NumericLiteral: {
        const number = Number(raw());
        return parseScalar("number", isNaN(number) ? 0 : number, parent);
      }

      case jsonc.SyntaxKind.TrueKeyword:
        return parseScalar("boolean", true, parent);

      case jsonc.SyntaxKind.FalseKeyword:
        return parseScalar("boolean", false, parent);

      case jsonc.SyntaxKind.NullKeyword:
        return parseScalar("null", null, parent);

      case jsonc.SyntaxKind.Unknown:
        if (raw().startsWith("'")) {
          return parseTokenAsString("string-single-quoted", parent);
        }

        report("invalid-literal", offset, length, { found: raw() });
        return parseScalar("null", null, parent);

      default:
        return undefined;
    }
  };

  next();

  if (kind() === jsonc.SyntaxKind.EOF) {
    report("value-expected", 0, 0);
    return { root: undefined, errors, comments, trailingCommas };
  }

  const root = parseValue();

  if (kind() !== jsonc.SyntaxKind.EOF) {
    report("end-of-file-expected", offset, Math.max(text.trimEnd().length - offset, 1));
  }

  errors.sort((a, b) => a.offset - b.offset);
  return { root, errors, comments, trailingCommas };
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

const invalidEscape = (token: string) => {
  for (let index = 0; index < token.length - 1; index++) {
    if (token[index] !== "\\") {
      continue;
    }

    if (!VALID_ESCAPES.has(token[index + 1])) {
      return { index, length: 2 };
    }

    if (token[index + 1] === "u") {
      const digits = hexDigitCount(token, index + 2);
      if (digits < 4) {
        return { index, length: 2 + digits };
      }
      index += 4;
    }

    index++;
  }

  return { index: 0, length: 2 };
};

const hexDigitCount = (token: string, start: number) => {
  let count = 0;
  while (count < 4 && /[0-9a-fA-F]/.test(token[start + count] ?? "")) {
    count++;
  }

  return count;
};

const KEY_STARTS = new Set([
  jsonc.SyntaxKind.StringLiteral,
  jsonc.SyntaxKind.NumericLiteral,
  jsonc.SyntaxKind.TrueKeyword,
  jsonc.SyntaxKind.FalseKeyword,
  jsonc.SyntaxKind.NullKeyword,
  jsonc.SyntaxKind.Unknown
]);

const WHITESPACE_AND_COMMENTS = new Set([
  jsonc.SyntaxKind.Trivia,
  jsonc.SyntaxKind.LineBreakTrivia,
  jsonc.SyntaxKind.LineCommentTrivia,
  jsonc.SyntaxKind.BlockCommentTrivia
]);
