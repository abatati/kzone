import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("defaults to sandbox URLs", () => {
    const config = loadConfig({ ALPACA_API_KEY: "k", ALPACA_API_SECRET: "s" });
    assert.equal(config.env, "sandbox");
    assert.equal(config.brokerBaseUrl, "https://broker-api.sandbox.alpaca.markets");
    assert.equal(config.dataBaseUrl, "https://data.sandbox.alpaca.markets");
    assert.equal(config.credentialsPresent, true);
  });

  it("uses live URLs", () => {
    const config = loadConfig({
      ALPACA_API_KEY: "k",
      ALPACA_API_SECRET: "s",
      ALPACA_BROKER_ENV: "live",
    });
    assert.equal(config.env, "live");
    assert.equal(config.brokerBaseUrl, "https://broker-api.alpaca.markets");
    assert.equal(config.dataBaseUrl, "https://data.alpaca.markets");
  });

  it("allows URL overrides and treats missing secrets as not present", () => {
    const config = loadConfig({
      ALPACA_BROKER_BASE_URL: "https://example.test/",
      ALPACA_DATA_BASE_URL: "https://data.example.test",
    });
    assert.equal(config.credentialsPresent, false);
    assert.equal(config.brokerBaseUrl, "https://example.test");
    assert.equal(config.dataBaseUrl, "https://data.example.test");
  });

  it("rejects unknown environments", () => {
    assert.throws(() => loadConfig({ ALPACA_BROKER_ENV: "prod" }), /sandbox" or "live/);
  });
});
