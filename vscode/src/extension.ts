import * as path from "node:path";
import { LanguageClient, TransportKind } from "vscode-languageclient/node";

import type { ExtensionContext } from "vscode";

let client: LanguageClient | undefined;

export const activate = async (context: ExtensionContext) => {
  const serverModule = context.asAbsolutePath(path.join("out", "server.js"));
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
  await client.start();
};

export const deactivate = async () => client?.stop();
