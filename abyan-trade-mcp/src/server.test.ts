import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AlpacaClient } from "./alpaca.js";
import { loadConfig } from "./config.js";
import { createServer, SERVER_NAME } from "./server.js";

describe("createServer", () => {
  it("builds an MCP server named abyan-trade", () => {
    const config = loadConfig({});
    const server = createServer(config, new AlpacaClient(config));
    assert.equal(server.server.getClientVersion(), undefined);
    assert.equal(SERVER_NAME, "abyan-trade");
    assert.equal(server.isConnected(), false);
  });
});
