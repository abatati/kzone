import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AlpacaBrokerClient, AlpacaError, redactPii } from "./alpaca.js";
import { loadConfig } from "./config.js";

function configWithCreds() {
  return loadConfig({
    ALPACA_API_KEY: "key-id",
    ALPACA_API_SECRET: "secret",
    ALPACA_BROKER_ENV: "sandbox",
  });
}

describe("redactPii", () => {
  it("redacts tax ids and document content", () => {
    const redacted = redactPii({
      id: "acc-1",
      identity: { given_name: "Ada", tax_id: "123-45-6789" },
      documents: [{ document_type: "passport", content: "/9j/Cg==" }],
    });
    assert.deepEqual(redacted, {
      id: "acc-1",
      identity: { given_name: "Ada", tax_id: "[redacted]" },
      documents: [{ document_type: "passport", content: "[redacted]" }],
    });
  });
});

describe("AlpacaBrokerClient", () => {
  it("fails fast without credentials", async () => {
    const client = new AlpacaBrokerClient(loadConfig({}));
    await assert.rejects(() => client.getClock(), (err: unknown) => {
      assert.ok(err instanceof AlpacaError);
      assert.equal(err.status, 0);
      return true;
    });
  });

  it("sends Basic auth and hits Broker paths", async () => {
    const calls: { url: string; method: string; headers: Headers }[] = [];
    const client = new AlpacaBrokerClient(configWithCreds(), (async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, method: String(init?.method), headers: new Headers(init?.headers) });
      return new Response(JSON.stringify({ is_open: true }), {
        status: 200,
        headers: { "x-request-id": "req-1" },
      });
    }) as typeof fetch);

    const clock = await client.getClock();
    assert.deepEqual(clock, { is_open: true });
    assert.equal(calls[0]?.method, "GET");
    assert.equal(calls[0]?.url, "https://broker-api.sandbox.alpaca.markets/v1/clock");
    const expected = `Basic ${Buffer.from("key-id:secret").toString("base64")}`;
    assert.equal(calls[0]?.headers.get("authorization"), expected);
  });

  it("posts compact order bodies and omits empty query params", async () => {
    let captured: { url: string; body: string | undefined } | undefined;
    const client = new AlpacaBrokerClient(configWithCreds(), (async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      captured = { url, body: typeof init?.body === "string" ? init.body : undefined };
      return new Response(JSON.stringify({ id: "ord-1" }), { status: 200 });
    }) as typeof fetch);

    await client.createOrder("acct-1", { symbol: "AAPL", qty: "1", side: "buy", type: "market", time_in_force: "day" });
    assert.match(captured?.url ?? "", /\/v1\/trading\/accounts\/acct-1\/orders$/);
    assert.equal(
      captured?.body,
      JSON.stringify({ symbol: "AAPL", qty: "1", side: "buy", type: "market", time_in_force: "day" }),
    );

    await client.listOrders("acct-1", { status: "open", after: undefined });
    assert.equal(
      captured?.url,
      "https://broker-api.sandbox.alpaca.markets/v1/trading/accounts/acct-1/orders?status=open",
    );
  });

  it("uses the market data host for snapshots", async () => {
    let url = "";
    const client = new AlpacaBrokerClient(configWithCreds(), (async (input) => {
      url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return new Response("{}", { status: 200 });
    }) as typeof fetch);
    await client.getStockSnapshot("AAPL");
    assert.equal(url, "https://data.sandbox.alpaca.markets/v2/stocks/AAPL/snapshot");
  });

  it("wraps HTTP errors with status and request id", async () => {
    const client = new AlpacaBrokerClient(configWithCreds(), (async () =>
      new Response(JSON.stringify({ message: "forbidden" }), {
        status: 403,
        headers: { "x-request-id": "abc" },
      })) as typeof fetch);

    await assert.rejects(() => client.listAccounts(), (err: unknown) => {
      assert.ok(err instanceof AlpacaError);
      assert.equal(err.status, 403);
      assert.equal(err.requestId, "abc");
      assert.deepEqual(err.body, { message: "forbidden" });
      return true;
    });
  });
});
