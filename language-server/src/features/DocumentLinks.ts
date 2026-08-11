import * as jsonc from "jsonc-parser";
import * as JsonPointer from "@hyperjump/json-pointer";
import { resolveIri } from "@hyperjump/uri";
import { TextDocument } from "vscode-languageserver-textdocument";

import type { DocumentLink, Position, ServerCapabilities } from "vscode-languageserver";
import type { Server } from "../services/Server.ts";
import type { JsonDocuments } from "../services/JsonDocuments.ts";
import type { JsonDocument } from "../models/JsonDocument.ts";
import type { Workspace } from "../services/Workspace.ts";

type ResolvedTarget = {
  uri: string;
  node: jsonc.Node;
  positionAt: (offset: number) => Position;
};

type NavigableDocument = {
  uri: string;
  root: jsonc.Node;
  positionAt: (offset: number) => Position;
  pointerFrom: (pointer: string, from?: jsonc.Node) => jsonc.Node | undefined;
};

export class DocumentLinks {
  private jsonDocuments: JsonDocuments;
  private workspace: Workspace;

  constructor(server: Server, jsonDocuments: JsonDocuments, workspace: Workspace) {
    this.jsonDocuments = jsonDocuments;
    this.workspace = workspace;

    server.onInitialize(() => {
      const serverCapabilities: ServerCapabilities = {
        documentLinkProvider: {}
      };

      return {
        capabilities: serverCapabilities
      };
    });

    server.onDocumentLinks(async (params) => {
      const jsonDocument = this.jsonDocuments.get(params.textDocument.uri)!;

      const root = jsonDocument.findNodeAtPointer("");
      if (!root) {
        return [];
      }

      const refValueNodes: jsonc.Node[] = [];
      walkProperties(root, (propertyNode) => {
        const [keyNode, valueNode] = propertyNode.children ?? [];
        if (keyNode?.value === "$ref" && valueNode?.type === "string") {
          refValueNodes.push(valueNode);
        }
      });

      const links: DocumentLink[] = [];
      for (const valueNode of refValueNodes) {
        let target: ResolvedTarget | undefined;
        try {
          target = await findRefTarget(this.jsonDocuments, this.workspace, toNavigableDocument(jsonDocument, root), valueNode.value as string);
        } catch {
          // Unresolvable $ref skip
        }

        if (!target) {
          continue;
        }

        const targetPosition = target.positionAt(target.node.offset);
        links.push({
          target: `${target.uri}#${targetPosition.line + 1},${targetPosition.character + 1}`,
          range: {
            start: jsonDocument.positionAt(valueNode.offset + 1),
            end: jsonDocument.positionAt(valueNode.offset + valueNode.length - 1)
          }
        });
      }

      return links;
    });
  }
}

const walkProperties = (node: jsonc.Node | undefined, fn: (propertyNode: jsonc.Node) => void): void => {
  if (!node) {
    return;
  }

  if (node.type === "object") {
    for (const propertyNode of node.children ?? []) {
      fn(propertyNode);
      walkProperties(propertyNode.children?.[1], fn);
    }
  } else if (node.type === "array") {
    for (const itemNode of node.children ?? []) {
      walkProperties(itemNode, fn);
    }
  }
};

const findRefTarget = async (jsonDocuments: JsonDocuments, workspace: Workspace, doc: NavigableDocument, ref: string): Promise<ResolvedTarget | undefined> => {
  const visited = new Set<string>();

  while (true) {
    const resolved = await resolveOneHop(jsonDocuments, workspace, doc, ref);
    if (!resolved) {
      return undefined;
    }

    const location = `${resolved.doc.uri}#${resolved.node.offset}`;
    if (visited.has(location)) {
      return undefined;
    }
    visited.add(location);

    const nextRef = getRefValue(resolved.node);
    if (nextRef === undefined) {
      return { uri: resolved.doc.uri, node: resolved.node, positionAt: resolved.doc.positionAt };
    }

    doc = resolved.doc;
    ref = nextRef;
  }
};

const getRefValue = (node: jsonc.Node): string | undefined => {
  if (node.type !== "object") {
    return undefined;
  }

  for (const propertyNode of node.children ?? []) {
    const [keyNode, valueNode] = propertyNode.children ?? [];
    if (keyNode?.value === "$ref" && valueNode?.type === "string") {
      return valueNode.value as string;
    }
  }

  return undefined;
};

const resolveOneHop = async (jsonDocuments: JsonDocuments, workspace: Workspace, doc: NavigableDocument, ref: string): Promise<{ doc: NavigableDocument; node: jsonc.Node } | undefined> => {
  if (ref === "#" || ref.startsWith("#/")) {
    const node = doc.pointerFrom(ref.slice(1));
    return node && { doc, node };
  }

  if (ref.startsWith("#")) {
    const anchor = ref.slice(1);
    if (anchor.length === 0) {
      return undefined;
    }
    const node = findAnchorNode(doc.root, anchor);
    return node && { doc, node };
  }

  const hashIndex = ref.indexOf("#");
  const uri = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
  const fragment = hashIndex >= 0 ? ref.slice(hashIndex + 1) : undefined;

  if (uri.length === 0) {
    return undefined;
  }

  const embeddedNode = findEmbeddedSchemaNode(doc, uri);
  if (embeddedNode) {
    if (!fragment) {
      return { doc, node: embeddedNode };
    }

    const node = fragment.startsWith("/")
      ? doc.pointerFrom(fragment, embeddedNode)
      : findAnchorNode(embeddedNode, fragment);
    return node && { doc, node };
  }

  const targetUri = resolveAgainstDocument(uri, doc.uri);
  const targetDoc = await getNavigableDocument(targetUri, jsonDocuments, workspace);
  if (!targetDoc) {
    return undefined;
  }

  if (!fragment) {
    return { doc: targetDoc, node: targetDoc.root };
  }

  const node = fragment.startsWith("/")
    ? targetDoc.pointerFrom(fragment)
    : findAnchorNode(targetDoc.root, fragment);

  return node && { doc: targetDoc, node };
};

const getNavigableDocument = async (uri: string, jsonDocuments: JsonDocuments, workspace: Workspace): Promise<NavigableDocument | undefined> => {
  const openDocument = jsonDocuments.get(uri);
  if (openDocument) {
    const root = openDocument.findNodeAtPointer("");
    return root && toNavigableDocument(openDocument, root);
  }

  const text = await workspace.readFile(uri);
  const root = jsonc.parseTree(text);
  if (!root) {
    return undefined;
  }

  const textDocument = TextDocument.create(uri, "json", 0, text);
  return {
    uri,
    root,
    positionAt: (offset) => textDocument.positionAt(offset),
    pointerFrom: (pointer, from) => pointerLookup(from ?? root, pointer)
  };
};

const toNavigableDocument = (jsonDocument: JsonDocument, root: jsonc.Node): NavigableDocument => ({
  uri: jsonDocument.uri,
  root,
  positionAt: (offset) => jsonDocument.positionAt(offset),
  pointerFrom: (pointer, from) => jsonDocument.findNodeAtPointer(pointer, from)
});

const pointerLookup = (root: jsonc.Node, pointer: string): jsonc.Node | undefined => {
  let node: jsonc.Node | undefined = root;

  for (const segment of JsonPointer.pointerSegments(pointer)) {
    if (!node) {
      return undefined;
    }

    const key = node.type === "array" ? parseInt(segment) : segment;
    node = jsonc.findNodeAtLocation(node, [key]);
  }

  return node;
};

const findAnchorNode = (subtreeRoot: jsonc.Node, anchor: string): jsonc.Node | undefined => {
  let result: jsonc.Node | undefined;

  walkProperties(subtreeRoot, (propertyNode) => {
    if (result) {
      return;
    }

    const [keyNode, valueNode] = propertyNode.children ?? [];
    if (valueNode?.type !== "string") {
      return;
    }

    if (keyNode.value === "$anchor" && valueNode.value === anchor) {
      result = propertyNode.parent;
    } else if (keyNode.value === "$id" && valueNode.value === `#${anchor}`) {
      result = propertyNode.parent;
    }
  });

  return result;
};

const findEmbeddedSchemaNode = (doc: NavigableDocument, uri: string): jsonc.Node | undefined => {
  const absoluteUri = resolveAgainstDocument(uri, doc.uri);

  let result: jsonc.Node | undefined;

  walkProperties(doc.root, (propertyNode) => {
    if (result || propertyNode.parent === doc.root) {
      return;
    }

    const [keyNode, valueNode] = propertyNode.children ?? [];
    if (valueNode?.type !== "string" || (keyNode.value !== "$id" && keyNode.value !== "id")) {
      return;
    }

    if (resolveAgainstDocument(valueNode.value as string, doc.uri) === absoluteUri) {
      result = propertyNode.parent;
    }
  });

  return result;
};

const resolveAgainstDocument = (uri: string, baseUri: string): string => {
  try {
    return resolveIri(uri, baseUri);
  } catch {
    return uri;
  }
};
