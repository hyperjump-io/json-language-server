import * as path from "node:path";
import { LanguageClient, TransportKind } from "vscode-languageclient/node";
import { Uri, workspace } from "vscode";
import ignore from "ignore";

import type { ExtensionContext } from "vscode";

type FindFilesRequest = {
  include: string;
  exclude?: string;
  maxResults?: number;
};

type ReadFileRequest = {
  uri: string;
};

let client: LanguageClient | undefined;

export const activate = async (context: ExtensionContext) => {
  const serverModule = context.asAbsolutePath(path.join("out", "server.mjs"));
  const serverOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: {
        execArgv: ["--nolazy", "--inspect=6009"]
      }
    }
  };

  const clientOptions = {
    documentSelector: [
      { scheme: "file", language: "json" },
      { scheme: "file", language: "jsonc" }
    ]
  };

  client = new LanguageClient("hyperjumpJsonLanguageServer", "Hyperjump - JSON Language Server", serverOptions, clientOptions);

  const ig = ignore();
  try {
    for (const workspaceFolder of workspace.workspaceFolders ?? []) {
      const gitignoreUri = Uri.joinPath(workspaceFolder.uri, ".gitignore");
      const bytes = await workspace.fs.readFile(gitignoreUri);
      const gitignore = new TextDecoder().decode(bytes);
      ig.add(gitignore);
    }
  } catch {
  }

  client.onRequest("hyperjump/findFiles", async (params: FindFilesRequest) => {
    return (await workspace.findFiles(params.include, params.exclude, params.maxResults))
      .map((uri) => uri.toString())
      .filter((uri) => !ig.ignores(workspace.asRelativePath(uri)));
  });

  client.onRequest("hyperjump/readFile", async (params: ReadFileRequest) => {
    const bytes = await workspace.fs.readFile(Uri.parse(params.uri));
    return new TextDecoder().decode(bytes);
  });

  await client.start();
};

export const deactivate = async () => client?.stop();
