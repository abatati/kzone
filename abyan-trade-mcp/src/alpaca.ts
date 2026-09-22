import type { Config } from "./config.js";

export class AlpacaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "AlpacaError";
  }
}

const REDACT_KEYS = new Set([
  "tax_id",
  "tax_id_last_4",
  "content",
  "bank_account_number",
  "bank_routing_number",
]);

export function redactPii(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactPii);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACT_KEYS.has(key) ? "[redacted]" : redactPii(nested);
    }
    return out;
  }
  return value;
}

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method: "GET" | "POST" | "DELETE" | "PATCH";
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  api?: "broker" | "data";
}

export class AlpacaBrokerClient {
  constructor(
    private readonly config: Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request(opts: RequestOptions): Promise<unknown> {
    if (!this.config.credentialsPresent) {
      throw new AlpacaError(
        "Missing ALPACA_API_KEY / ALPACA_API_SECRET. Set Brokerdash correspondent credentials in the environment.",
        0,
        { error: "missing_credentials" },
      );
    }

    const base = opts.api === "data" ? this.config.dataBaseUrl : this.config.brokerBaseUrl;
    const url = new URL(opts.path, `${base}/`);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value === undefined || value === null || value === "") {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Basic ${Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString("base64")}`,
      Accept: "application/json",
    };
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await this.fetchImpl(url, {
      method: opts.method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });

    const requestId = response.headers.get("x-request-id") ?? undefined;
    const text = await response.text();
    let parsed: unknown = text.length === 0 ? null : text;
    try {
      parsed = text.length === 0 ? null : JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!response.ok) {
      throw new AlpacaError(
        `Alpaca ${opts.method} ${url.pathname} failed: HTTP ${response.status}`,
        response.status,
        parsed,
        requestId,
      );
    }

    return redactPii(parsed);
  }

  listAccounts(query: Record<string, QueryValue> = {}) {
    return this.request({ method: "GET", path: "/v1/accounts", query });
  }

  getAccount(accountId: string) {
    return this.request({ method: "GET", path: `/v1/accounts/${encodeURIComponent(accountId)}` });
  }

  getTradingAccount(accountId: string) {
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(accountId)}/account`,
    });
  }

  listPositions(accountId: string) {
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(accountId)}/positions`,
    });
  }

  getPosition(accountId: string, symbol: string) {
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(accountId)}/positions/${encodeURIComponent(symbol)}`,
    });
  }

  closePosition(accountId: string, symbol: string, query: Record<string, QueryValue> = {}) {
    return this.request({
      method: "DELETE",
      path: `/v1/trading/accounts/${encodeURIComponent(accountId)}/positions/${encodeURIComponent(symbol)}`,
      query,
    });
  }

  listOrders(accountId: string, query: Record<string, QueryValue> = {}) {
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(accountId)}/orders`,
      query,
    });
  }

  getOrder(accountId: string, orderId: string) {
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(accountId)}/orders/${encodeURIComponent(orderId)}`,
    });
  }

  createOrder(accountId: string, body: Record<string, unknown>) {
    return this.request({
      method: "POST",
      path: `/v1/trading/accounts/${encodeURIComponent(accountId)}/orders`,
      body,
    });
  }

  cancelOrder(accountId: string, orderId: string) {
    return this.request({
      method: "DELETE",
      path: `/v1/trading/accounts/${encodeURIComponent(accountId)}/orders/${encodeURIComponent(orderId)}`,
    });
  }

  cancelAllOrders(accountId: string) {
    return this.request({
      method: "DELETE",
      path: `/v1/trading/accounts/${encodeURIComponent(accountId)}/orders`,
    });
  }

  listActivities(accountId: string, query: Record<string, QueryValue> = {}) {
    return this.request({
      method: "GET",
      path: `/v1/accounts/${encodeURIComponent(accountId)}/activities`,
      query,
    });
  }

  getPortfolioHistory(accountId: string, query: Record<string, QueryValue> = {}) {
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(accountId)}/account/portfolio/history`,
      query,
    });
  }

  listAssets(query: Record<string, QueryValue> = {}) {
    return this.request({ method: "GET", path: "/v1/assets", query });
  }

  getAsset(symbolOrId: string) {
    return this.request({
      method: "GET",
      path: `/v1/assets/${encodeURIComponent(symbolOrId)}`,
    });
  }

  getClock() {
    return this.request({ method: "GET", path: "/v1/clock" });
  }

  getCalendar(query: Record<string, QueryValue> = {}) {
    return this.request({ method: "GET", path: "/v1/calendar", query });
  }

  getStockSnapshot(symbol: string) {
    return this.request({
      method: "GET",
      path: `/v2/stocks/${encodeURIComponent(symbol)}/snapshot`,
      api: "data",
    });
  }
}
