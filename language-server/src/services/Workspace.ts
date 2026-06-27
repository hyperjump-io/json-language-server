import {
  DidChangeWatchedFilesNotification,
  DidChangeWatchedFilesParams,
  Disposable,
  NotificationHandler,
  ServerCapabilities
} from "vscode-languageserver";
import { Server } from "./Server.ts";

export class Workspace {
  private _workspaceFolders: Set<string> = new Set();
  private didChangeWatchedFilesHandlers: Set<NotificationHandler<DidChangeWatchedFilesParams>>;

  constructor(server: Server) {
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
            this.workspaceFolders.add(workspaceFolder.uri);
          }

          for (const workspaceFolder of removed) {
            this.workspaceFolders.delete(workspaceFolder.uri);
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
}
