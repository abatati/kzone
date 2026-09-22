import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("defaults non-trading keys to Broker sandbox URLs", () => {
    const config = loadConfig({ ALPACA_API_KEY: "corr-key", ALPACA_API_SECRET: "s" });
    assert.equal(config.apiMode, "broker");
    assert.equal(config.env, "sandbox");
    assert.equal(config.apiBaseUrl, "https://broker-api.sandbox.alpaca.markets");
    assert.equal(config.dataBaseUrl, "https://data.sandbox.alpaca.markets");
    assert.equal(config.credentialsPresent, true);
  });

  it("uses live Broker URLs", () => {
    const config = loadConfig({
      ALPACA_API_KEY: "corr-key",
      ALPACA_API_SECRET: "s",
      ALPACA_BROKER_ENV: "live",
    });
    assert.equal(config.apiMode, "broker");
    assert.equal(config.env, "live");
    assert.equal(config.apiBaseUrl, "https://broker-api.alpaca.markets");
    assert.equal(config.dataBaseUrl, "https://data.alpaca.markets");
  });

  it("treats PK keys as Trading API paper", () => {
    const config = loadConfig({
      ALPACA_API_KEY: "PKEXAMPLE",
      ALPACA_API_SECRET: "s",
    });
    assert.equal(config.apiMode, "trading");
    assert.equal(config.env, "paper");
    assert.equal(config.apiBaseUrl, "https://paper-api.alpaca.markets");
    assert.equal(config.dataBaseUrl, "https://data.alpaca.markets");
  });

  it("honors ALPACA_TRADING_ENV=paper", () => {
    const config = loadConfig({
      ALPACA_API_KEY: "not-a-pk-prefix",
      ALPACA_API_SECRET: "s",
      ALPACA_TRADING_ENV: "paper",
    });
    assert.equal(config.apiMode, "trading");
    assert.equal(config.env, "paper");
    assert.equal(config.apiBaseUrl, "https://paper-api.alpaca.markets");
  });

  it("allows URL overrides and treats missing secrets as not present", () => {
    const config = loadConfig({
      ALPACA_BROKER_BASE_URL: "https://example.test/",
      ALPACA_DATA_BASE_URL: "https://data.example.test",
    });
    assert.equal(config.apiMode, "broker");
    assert.equal(config.credentialsPresent, false);
    assert.equal(config.apiBaseUrl, "https://example.test");
    assert.equal(config.dataBaseUrl, "https://data.example.test");
  });

  it("rejects unknown environments", () => {
    assert.throws(() => loadConfig({ ALPACA_BROKER_ENV: "prod" }), /sandbox" or "live/);
    assert.throws(
      () => loadConfig({ ALPACA_API_KEY: "PKX", ALPACA_TRADING_ENV: "sandbox" }),
      /paper" or "live/,
    );
  });
});
