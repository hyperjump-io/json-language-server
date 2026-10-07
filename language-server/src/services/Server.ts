import { merge } from "merge-anything";
import { normalizeIri } from "@hyperjump/uri";

import type {
  Connection,
  Disposable,
  InitializedParams,
  InitializeError,
  InitializeParams,
  InitializeResult,
  NotificationHandler,
  NotificationHandler0,
  RequestHandler0,
  ServerRequestHandler
} from "vscode-languageserver";

type UriParams = {
  textDocument?: { uri: string };
  changes?: unknown[];
};

type RegisterHandler = (handler: never) => Disposable;

export class Server implements Connection {
  private connection: Connection;
  private initializeHandlers: Set<ServerRequestHandler<InitializeParams, InitializeResult, never, InitializeError>>;
  private initializedHandlers: Set<NotificationHandler<InitializedParams>>;
  private _isInitialized: Promise<void>;
  private shutdownHandlers: Set<RequestHandler0<void, void>>;
  private exitHandlers: Set<NotificationHandler0>;

  declare listen: Connection["listen"];
  declare onRequest: Connection["onRequest"];
  declare sendRequest: Connection["sendRequest"];
  declare onNotification: Connection["onNotification"];
  declare sendNotification: Connection["sendNotification"];
  declare onProgress: Connection["onProgress"];
  declare sendProgress: Connection["sendProgress"];
  declare onDidChangeConfiguration: Connection["onDidChangeConfiguration"];
  declare onDidChangeWatchedFiles: Connection["onDidChangeWatchedFiles"];
  declare onDidOpenTextDocument: Connection["onDidOpenTextDocument"];
  declare onDidChangeTextDocument: Connection["onDidChangeTextDocument"];
  declare onDidCloseTextDocument: Connection["onDidCloseTextDocument"];
  declare onWillSaveTextDocument: Connection["onWillSaveTextDocument"];
  declare onWillSaveTextDocumentWaitUntil: Connection["onWillSaveTextDocumentWaitUntil"];
  declare onDidSaveTextDocument: Connection["onDidSaveTextDocument"];
  declare sendDiagnostics: Connection["sendDiagnostics"];
  declare onHover: Connection["onHover"];
  declare onCompletion: Connection["onCompletion"];
  declare onCompletionResolve: Connection["onCompletionResolve"];
  declare onSignatureHelp: Connection["onSignatureHelp"];
  declare onDeclaration: Connection["onDeclaration"];
  declare onDefinition: Connection["onDefinition"];
  declare onTypeDefinition: Connection["onTypeDefinition"];
  declare onImplementation: Connection["onImplementation"];
  declare onReferences: Connection["onReferences"];
  declare onDocumentHighlight: Connection["onDocumentHighlight"];
  declare onDocumentSymbol: Connection["onDocumentSymbol"];
  declare onWorkspaceSymbol: Connection["onWorkspaceSymbol"];
  declare onWorkspaceSymbolResolve: Connection["onWorkspaceSymbolResolve"];
  declare onCodeAction: Connection["onCodeAction"];
  declare onCodeActionResolve: Connection["onCodeActionResolve"];
  declare onCodeLens: Connection["onCodeLens"];
  declare onCodeLensResolve: Connection["onCodeLensResolve"];
  declare onDocumentFormatting: Connection["onDocumentFormatting"];
  declare onDocumentRangeFormatting: Connection["onDocumentRangeFormatting"];
  declare onDocumentRangesFormatting: Connection["onDocumentRangesFormatting"];
  declare onDocumentOnTypeFormatting: Connection["onDocumentOnTypeFormatting"];
  declare onRenameRequest: Connection["onRenameRequest"];
  declare onPrepareRename: Connection["onPrepareRename"];
  declare onDocumentLinks: Connection["onDocumentLinks"];
  declare onDocumentLinkResolve: Connection["onDocumentLinkResolve"];
  declare onDocumentColor: Connection["onDocumentColor"];
  declare onColorPresentation: Connection["onColorPresentation"];
  declare onFoldingRanges: Connection["onFoldingRanges"];
  declare onSelectionRanges: Connection["onSelectionRanges"];
  declare onExecuteCommand: Connection["onExecuteCommand"];
  declare dispose: Connection["dispose"];

  constructor(connection: Connection) {
    this.connection = connection;

    this.initializeHandlers = new Set();
    this.connection.onInitialize((params, token, workDoneProgress) => {
      connection.console.log("Initializing");

      let initializeResult: InitializeResult = {
        capabilities: {}
      };
      const normalizedParams: InitializeParams = {
        ...params,
        workspaceFolders: params.workspaceFolders?.map((workspaceFolder) => {
          return { ...workspaceFolder, uri: normalizeIri(workspaceFolder.uri) };
        })
      };

      for (const handler of this.initializeHandlers) {
        const handlerResult = handler(normalizedParams, token, workDoneProgress);
        initializeResult = merge(initializeResult, handlerResult as InitializeResult);
      }

      return initializeResult;
    });

    this.initializedHandlers = new Set();
    this._isInitialized = new Promise<void>((resolve, reject) => {
      this.connection.onInitialized(async (params) => {
        try {
          for (const handler of this.initializedHandlers) {
            await handler(params);
          }

          connection.console.log("Ready");
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });

    this.shutdownHandlers = new Set();
    this.connection.onShutdown(async (params) => {
      for (const handler of this.shutdownHandlers) {
        await handler(params);
      }
    });

    this.exitHandlers = new Set();
    this.connection.onExit(async () => {
      for (const handler of this.exitHandlers) {
        await handler();
      }
    });

    this.listen = this.connection.listen.bind(this.connection);
    this.onRequest = this.connection.onRequest.bind(this.connection);
    this.sendRequest = this.connection.sendRequest.bind(this.connection);
    this.onNotification = this.connection.onNotification.bind(this.connection);
    this.sendNotification = this.connection.sendNotification.bind(this.connection);
    this.onProgress = this.connection.onProgress.bind(this.connection);
    this.sendProgress = this.connection.sendProgress.bind(this.connection);
    this.onDidChangeConfiguration = this.connection.onDidChangeConfiguration.bind(this.connection);
    this.onDidChangeWatchedFiles = withNormalizedUris(this.connection.onDidChangeWatchedFiles.bind(this.connection));
    this.onDidOpenTextDocument = withNormalizedUris(this.connection.onDidOpenTextDocument.bind(this.connection));
    this.onDidChangeTextDocument = withNormalizedUris(this.connection.onDidChangeTextDocument.bind(this.connection));
    this.onDidCloseTextDocument = withNormalizedUris(this.connection.onDidCloseTextDocument.bind(this.connection));
    this.onWillSaveTextDocument = withNormalizedUris(this.connection.onWillSaveTextDocument.bind(this.connection));
    this.onWillSaveTextDocumentWaitUntil = withNormalizedUris(this.connection.onWillSaveTextDocumentWaitUntil.bind(this.connection));
    this.onDidSaveTextDocument = withNormalizedUris(this.connection.onDidSaveTextDocument.bind(this.connection));
    this.sendDiagnostics = this.connection.sendDiagnostics.bind(this.connection);
    this.onHover = withNormalizedUris(this.connection.onHover.bind(this.connection));
    this.onCompletion = withNormalizedUris(this.connection.onCompletion.bind(this.connection));
    this.onCompletionResolve = this.connection.onCompletionResolve.bind(this.connection);
    this.onSignatureHelp = withNormalizedUris(this.connection.onSignatureHelp.bind(this.connection));
    this.onDeclaration = withNormalizedUris(this.connection.onDeclaration.bind(this.connection));
    this.onDefinition = withNormalizedUris(this.connection.onDefinition.bind(this.connection));
    this.onTypeDefinition = withNormalizedUris(this.connection.onTypeDefinition.bind(this.connection));
    this.onImplementation = withNormalizedUris(this.connection.onImplementation.bind(this.connection));
    this.onReferences = withNormalizedUris(this.connection.onReferences.bind(this.connection));
    this.onDocumentHighlight = withNormalizedUris(this.connection.onDocumentHighlight.bind(this.connection));
    this.onDocumentSymbol = withNormalizedUris(this.connection.onDocumentSymbol.bind(this.connection));
    this.onWorkspaceSymbol = this.connection.onWorkspaceSymbol.bind(this.connection);
    this.onWorkspaceSymbolResolve = this.connection.onWorkspaceSymbolResolve.bind(this.connection);
    this.onCodeAction = withNormalizedUris(this.connection.onCodeAction.bind(this.connection));
    this.onCodeActionResolve = this.connection.onCodeActionResolve.bind(this.connection);
    this.onCodeLens = withNormalizedUris(this.connection.onCodeLens.bind(this.connection));
    this.onCodeLensResolve = this.connection.onCodeLensResolve.bind(this.connection);
    this.onDocumentFormatting = withNormalizedUris(this.connection.onDocumentFormatting.bind(this.connection));
    this.onDocumentRangeFormatting = withNormalizedUris(this.connection.onDocumentRangeFormatting.bind(this.connection));
    this.onDocumentRangesFormatting = withNormalizedUris(this.connection.onDocumentRangesFormatting.bind(this.connection));
    this.onDocumentOnTypeFormatting = withNormalizedUris(this.connection.onDocumentOnTypeFormatting.bind(this.connection));
    this.onRenameRequest = withNormalizedUris(this.connection.onRenameRequest.bind(this.connection));
    this.onPrepareRename = withNormalizedUris(this.connection.onPrepareRename.bind(this.connection));
    this.onDocumentLinks = withNormalizedUris(this.connection.onDocumentLinks.bind(this.connection));
    this.onDocumentLinkResolve = this.connection.onDocumentLinkResolve.bind(this.connection);
    this.onDocumentColor = withNormalizedUris(this.connection.onDocumentColor.bind(this.connection));
    this.onColorPresentation = withNormalizedUris(this.connection.onColorPresentation.bind(this.connection));
    this.onFoldingRanges = withNormalizedUris(this.connection.onFoldingRanges.bind(this.connection));
    this.onSelectionRanges = withNormalizedUris(this.connection.onSelectionRanges.bind(this.connection));
    this.onExecuteCommand = this.connection.onExecuteCommand.bind(this.connection);
    this.dispose = this.connection.dispose.bind(this.connection);
  }

  onInitialize(handler: ServerRequestHandler<InitializeParams, InitializeResult, never, InitializeError>): Disposable {
    this.initializeHandlers.add(handler);
    return {
      dispose: () => {
        this.initializeHandlers.delete(handler);
      }
    };
  }

  onInitialized(handler: NotificationHandler<InitializedParams>): Disposable {
    this.initializedHandlers.add(handler);
    return {
      dispose: () => {
        this.initializedHandlers.delete(handler);
      }
    };
  }

  get isInitialized() {
    return this._isInitialized;
  }

  onShutdown(handler: RequestHandler0<void, void>): Disposable {
    this.shutdownHandlers.add(handler);
    return {
      dispose: () => {
        this.shutdownHandlers.delete(handler);
      }
    };
  }

  onExit(handler: NotificationHandler0): Disposable {
    this.exitHandlers.add(handler);
    return {
      dispose: () => {
        this.exitHandlers.delete(handler);
      }
    };
  }

  get console() {
    return this.connection.console;
  }

  get tracer() {
    return this.connection.tracer;
  }

  get telemetry() {
    return this.connection.telemetry;
  }

  get client() {
    return this.connection.client;
  }

  get window() {
    return this.connection.window;
  }

  get workspace() {
    return this.connection.workspace;
  }

  get languages() {
    return this.connection.languages;
  }

  get notebooks() {
    return this.connection.notebooks;
  }
}

// URIs from the client are normalized here so they match URIs the server produces with @hyperjump/uri.
// Everything past this point can compare URIs without normalizing them again.
const normalizeUris = <P extends UriParams>(params: P): P => {
  if (params.textDocument) {
    return { ...params, textDocument: { ...params.textDocument, uri: normalizeIri(params.textDocument.uri) } };
  } else if (params.changes) {
    // Watched file changes. Text document changes have a textDocument, so they're handled above.
    const changes = params.changes as { uri: string }[];
    return { ...params, changes: changes.map((change) => ({ ...change, uri: normalizeIri(change.uri) })) };
  } else {
    return params;
  }
};

// The handler types vary too much between methods to express, but every wrapped method takes a handler whose
// first argument is the params
const withNormalizedUris = <R extends RegisterHandler>(register: R): R => {
  const wrapped = (handler: (params: UriParams, ...args: unknown[]) => unknown) => {
    return register(((params: UriParams, ...args: unknown[]) => handler(normalizeUris(params), ...args)) as never);
  };
  return wrapped as unknown as R;
};
