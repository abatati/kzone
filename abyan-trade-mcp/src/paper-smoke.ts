import { AlpacaClient } from "./alpaca.js";
import { loadConfig, publicConfig } from "./config.js";

const config = loadConfig();
const client = new AlpacaClient(config);
console.log(JSON.stringify({ config: publicConfig(config) }));

async function call(name: string, fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    if (name === "clock") {
      const c = data as { timestamp?: string; is_open?: boolean };
      console.log(JSON.stringify({ name, ok: true, is_open: c.is_open, timestamp: c.timestamp }));
      return;
    }
    if (name === "account") {
      const a = data as Record<string, unknown>;
      console.log(
        JSON.stringify({
          name,
          ok: true,
          has_id: Boolean(a.id),
          status: a.status,
          currency: a.currency,
          cash_present: typeof a.cash === "string",
          trading_blocked: a.trading_blocked,
        }),
      );
      return;
    }
    if (name === "positions") {
      console.log(JSON.stringify({ name, ok: true, count: Array.isArray(data) ? data.length : -1 }));
      return;
    }
    if (name === "asset") {
      const a = data as Record<string, unknown>;
      console.log(
        JSON.stringify({
          name,
          ok: true,
          symbol: a.symbol,
          tradable: a.tradable,
          status: a.status,
          class: a.class ?? a.asset_class,
        }),
      );
    }
  } catch (err) {
    const e = err as { name?: string; status?: number; message?: string };
    console.log(JSON.stringify({ name, ok: false, error: e.name, status: e.status, message: e.message }));
  }
}

await call("clock", () => client.getClock());
await call("account", () => client.getAccount());
await call("positions", () => client.listPositions());
await call("asset", () => client.getAsset("AAPL"));
