#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { applyDotEnv, loadConfig } from "./config.js";
import { createServer } from "./server.js";

applyDotEnv();
const config = loadConfig();

void serveStdio(() => createServer(config));
console.error(
  `abyan-trade-mcp listening on stdio (Alpaca Broker ${config.env} ${config.brokerBaseUrl}; credentials ${config.credentialsPresent ? "set" : "missing"})`,
);
