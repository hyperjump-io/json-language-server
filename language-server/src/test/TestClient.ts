import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { Duplex } from "node:stream";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ConfigurationRequest,
  DidChangeConfigurationNotification,
  DidChangeTextDocumentNotification,
  DidChangeWatchedFilesNotification,
  DidCloseTextDocumentNotification,
  DidOpenTextDocumentNotification,
  ExitNotification,
  FileChangeType,
  InitializedNotification,
  InitializeRequest,
  RegistrationRequest,
  ShutdownRequest
} from "vscode-languageserver";
import { createConnection } from "vscode-languageserver/node";
import { resolveIri } from "@hyperjump/uri";
import { merge } from "merge-anything";
import { MockAgent, setGlobalDispatcher } from "undici";
import { buildServer, LanguageServerSettings } from "../build-server.js";

import type {
  Connection,
  DidChangeConfigurationRegistrationOptions,
  InitializeParams,
  ServerCapabilities
} from "vscode-languageserver";

export class TestClient {
  private client: Connection;
  private serverName: string;
  private watchEnabled: boolean;
  private _serverCapabilities: ServerCapabilities | undefined;
  private languageServerSettings: Partial<LanguageServerSettings> | undefined;
  private configurationChangeNotificationOptions: DidChangeConfigurationRegistrationOptions | null | undefined;
  private openDocuments: Set<string>;
  private workspaceFolder: Promise<string>;

  onRequest: Connection["onRequest"];
  sendRequest: Connection["sendRequest"];
  onNotification: Connection["onNotification"];
  sendNotification: Connection["sendNotification"];
  onProgress: Connection["onProgress"];
  sendProgress: Connection["sendProgress"];
  mockAgent: MockAgent;

  constructor(serverName = "hyperjumpJsonLanguageServer") {
    this.serverName = serverName;
    this.watchEnabled = false;
    this.openDocuments = new Set();
    this.workspaceFolder = mkdtemp(join(tmpdir(), "test-workspace-"))
      .then((path) => pathToFileURL(path) + "/");

    this.mockAgent = new MockAgent();
    this.mockAgent.disableNetConnect();
    setGlobalDispatcher(this.mockAgent);

    const up = new TestStream();
    const down = new TestStream();

    const connection = createConnection(up, down);

    const server = buildServer(connection);
    server.listen();

    this.client = createConnection(down, up);
    this.onRequest = this.client.onRequest.bind(this.client);
    this.sendRequest = this.client.sendRequest.bind(this.client);
    this.onNotification = this.client.onNotification.bind(this.client);
    this.sendNotification = this.client.sendNotification.bind(this.client);
    this.onProgress = this.client.onProgress.bind(this.client);
    this.sendProgress = this.client.sendProgress.bind(this.client);

    this.client.onRequest(RegistrationRequest.type, ({ registrations }) => {
      for (const registration of registrations) {
        if (registration.method === DidChangeConfigurationNotification.method) {
          this.configurationChangeNotificationOptions = registration.registerOptions === undefined
            ? null
            : registration.registerOptions as DidChangeConfigurationRegistrationOptions;
        } else if (registration.method === DidChangeWatchedFilesNotification.method) {
          this.watchEnabled = true;
        } else {
          throw Error(`Unsupported Registration: '${registration.method}'`);
        }
      }
    });

    this.client.onRequest(ConfigurationRequest.type, (params) => {
      return params.items.map((configurationItem) => {
        switch (configurationItem.section) {
          case this.serverName:
            return this.languageServerSettings;
          default:
            throw Error(`Unsupported configuration section: ${configurationItem.section}`);
        }
      });
    });

    this.client.listen();
  }

  get serverCapabilities() {
    return structuredClone(this._serverCapabilities);
  }

  async start(params: Partial<InitializeParams> = {}) {
    const defaultInitParams: InitializeParams = {
      processId: null,
      rootUri: null,
      capabilities: {
        workspace: {
          workspaceFolders: true,
          didChangeWatchedFiles: {
            dynamicRegistration: true
          },
          configuration: true,
          didChangeConfiguration: {
            dynamicRegistration: true
          }
        },
        window: {
          workDoneProgress: true
        },
        textDocument: {
          semanticTokens: {
            dynamicRegistration: true,
            tokenTypes: [
              "namespace",
              "type",
              "class",
              "enum",
              "interface",
              "struct",
              "typeParameter",
              "parameter",
              "variable",
              "property",
              "enumMember",
              "event",
              "function",
              "method",
              "macro",
              "keyword",
              "modifier",
              "comment",
              "string",
              "number",
              "regexp",
              "operator",
              "decorator"
            ],
            tokenModifiers: [
              "declaration",
              "definition",
              "readonly",
              "static",
              "deprecated",
              "abstract",
              "async",
              "modification",
              "documentation",
              "defaultLibrary"
            ],
            formats: ["relative"],
            requests: {
              range: true,
              full: {
                delta: true
              }
            },
            multilineTokenSupport: false,
            overlappingTokenSupport: false,
            serverCancelSupport: true,
            augmentsSyntaxTokens: true
          }
        }
      },
      workspaceFolders: [
        {
          name: "root",
          uri: await this.workspaceFolder
        }
      ]
    };

    const initializeResult = await this.client.sendRequest(InitializeRequest.type, merge(defaultInitParams, params) as InitializeParams);
    this._serverCapabilities = initializeResult.capabilities;

    await this.client.sendNotification(InitializedNotification.type, {});

    // Wait for dynamic registrations to be completed
    // await wait(100);

    await this.changeConfiguration();
  }

  async stop() {
    await this.client.sendRequest(ShutdownRequest.type);
    await this.client.sendNotification(ExitNotification.type);
    await rm(fileURLToPath(await this.workspaceFolder), { recursive: true });
    this.client.dispose();
  }

  async changeConfiguration(languageServerSettings?: Partial<LanguageServerSettings>) {
    this.languageServerSettings = languageServerSettings ?? this.languageServerSettings;

    if (this.configurationChangeNotificationOptions === null) {
      await this.client.sendNotification(DidChangeConfigurationNotification.type, {
        settings: null
      });
    } else if (this.configurationChangeNotificationOptions) {
      await this.client.sendNotification(DidChangeConfigurationNotification.type, {
        settings: {
          [this.serverName]: this.languageServerSettings
        }
      });
    }
  }

  async writeDocument(uri: string, text: string) {
    const fullUri = resolveIri(uri, await this.workspaceFolder);
    const fullPath = fileURLToPath(fullUri);
    const exists = await access(fullPath)
      .then(() => true)
      .catch(() => false);

    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, text, "utf-8");

    if (this.watchEnabled) {
      await this.client.sendNotification(DidChangeWatchedFilesNotification.type, {
        changes: [{
          type: exists ? FileChangeType.Changed : FileChangeType.Created,
          uri: fullUri.toString()
        }]
      });
    }

    return fullUri;
  }

  async deleteDocument(uri: string) {
    const fullUri = resolveIri(uri, await this.workspaceFolder);
    const fullPath = fileURLToPath(fullUri);
    await rm(fileURLToPath(fullPath));

    return fullUri;
  }

  async openDocument(uri: string) {
    const fullUri = resolveIri(uri, await this.workspaceFolder);
    const fullPath = fileURLToPath(fullUri);

    await this.client.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri: fullUri,
        languageId: "json",
        version: 0,
        text: await readFile(fullPath, "utf-8")
      }
    });

    this.openDocuments.add(fullUri);

    return fullUri;
  }

  async changeDocument(uri: string, text: string) {
    const fullUri = resolveIri(uri, await this.workspaceFolder);

    await this.client.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: {
        uri: fullUri,
        version: 1
      },
      contentChanges: [{ text }]
    });

    return fullUri;
  }

  async closeDocument(uri: string) {
    this.openDocuments.delete(uri);

    await this.client.sendNotification(DidCloseTextDocumentNotification.type, {
      textDocument: {
        uri: uri
      }
    });
  }
}

export class TestStream extends Duplex {
  _write(chunk: string, _encoding: string, done: () => void) {
    this.emit("data", chunk);
    done();
  }

  _read() {
  }
}
