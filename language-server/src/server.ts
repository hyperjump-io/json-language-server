import { ProposedFeatures } from "vscode-languageserver";
import { createConnection } from "vscode-languageserver/node.js";
import { buildServer } from "./build-server.ts";

const connection = createConnection(ProposedFeatures.all);
connection.console.log("Starting JSON language server ...");

const server = buildServer(connection);
server.listen();
