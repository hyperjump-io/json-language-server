import { DidChangeWatchedFilesNotification, Disposable } from "vscode-languageserver";
import { normalizeIri } from "@hyperjump/uri";
import { Server } from "./Server.ts";
import { ReadFileRequest } from "../protocol/hyperjump-readFile.ts";
import { FindFilesRequest } from "../protocol/hyperjump-findFiles.ts";

import type {
  DidChangeWatchedFilesParams,
  NotificationHandler,
  ServerCapabilities
} from "vscode-languageserver";

export class Workspace {
  private server: Server;
  private _workspaceFolders: Set<string> = new Set();
  private didChangeWatchedFilesHandlers: Set<NotificationHandler<DidChangeWatchedFilesParams>>;

  constructor(server: Server) {
    this.server = server;

    let hasWorkspaceWatchCapability = false;
    let hasWorkspaceFolderCapability = false;

    this.didChangeWatchedFilesHandlers = new Set();

    server.onInitialize(({ capabilities, workspaceFolders }) => {
      if (workspaceFolders) {
        for (const workspaceFolder of workspaceFolders) {
          this.workspaceFolders.add(workspaceFolder.uri);
        }
      }

      hasWorkspaceWatchCapability = !!capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration;
      hasWorkspaceFolderCapability = !!capabilities.workspace?.workspaceFolders;

      const serverCapabilities: ServerCapabilities = {};

      if (hasWorkspaceFolderCapability) {
        serverCapabilities.workspace = {
          workspaceFolders: {
            supported: true,
            changeNotifications: true
          }
        };
      }

      return {
        capabilities: serverCapabilities
      };
    });

    server.onInitialized(async () => {
      if (hasWorkspaceWatchCapability) {
        await server.client.register(DidChangeWatchedFilesNotification.type, {
          watchers: [{ globPattern: "**/*" }]
        });
      }

      if (hasWorkspaceFolderCapability) {
        server.workspace.onDidChangeWorkspaceFolders(({ added, removed }) => {
          for (const workspaceFolder of added) {
            this.workspaceFolders.add(normalizeIri(workspaceFolder.uri));
          }

          for (const workspaceFolder of removed) {
            this.workspaceFolders.delete(normalizeIri(workspaceFolder.uri));
          }
        });
      }
    });

    server.onDidChangeWatchedFiles(async (params) => {
      for (const handler of this.didChangeWatchedFilesHandlers) {
        await handler(params);
      }
    });
  }

  get workspaceFolders() {
    return this._workspaceFolders;
  }

  onDidChangeWatchedFiles(handler: NotificationHandler<DidChangeWatchedFilesParams>): Disposable {
    this.didChangeWatchedFilesHandlers.add(handler);
    return {
      dispose: () => {
        this.didChangeWatchedFilesHandlers.delete(handler);
      }
    };
  }

  async readFile(uri: string) {
    return await this.server.sendRequest(ReadFileRequest.type, { uri });
  }

  async findFiles(include: string, exclude?: string, maxResults?: number) {
    const fileUris = await this.server.sendRequest(FindFilesRequest.type, { include, exclude, maxResults });
    return fileUris.map(normalizeIri);
  }
}
