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
  api?: "trading" | "data";
}

function authHeaders(config: Config): Record<string, string> {
  if (config.apiMode === "trading") {
    return {
      "APCA-API-KEY-ID": config.apiKey,
      "APCA-API-SECRET-KEY": config.apiSecret,
    };
  }
  return {
    Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`,
  };
}

export class AlpacaClient {
  constructor(
    private readonly config: Config,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get apiMode() {
    return this.config.apiMode;
  }

  private requireBrokerAccountId(accountId: string | undefined): string {
    if (this.config.apiMode === "trading") {
      return "";
    }
    if (!accountId) {
      throw new AlpacaError(
        "account_id is required when using Alpaca Broker API. Trading API paper/live keys do not need it.",
        0,
        { error: "missing_account_id" },
      );
    }
    return accountId;
  }

  async request(opts: RequestOptions): Promise<unknown> {
    if (!this.config.credentialsPresent) {
      throw new AlpacaError(
        "Missing ALPACA_API_KEY / ALPACA_API_SECRET. Set Trading API paper/live keys (PK…/AK…) or Brokerdash correspondent credentials.",
        0,
        { error: "missing_credentials" },
      );
    }

    const base = opts.api === "data" ? this.config.dataBaseUrl : this.config.apiBaseUrl;
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
      ...authHeaders(this.config),
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
    if (this.config.apiMode === "trading") {
      return this.request({ method: "GET", path: "/v2/account" }).then((account) => [account]);
    }
    return this.request({ method: "GET", path: "/v1/accounts", query });
  }

  getAccount(accountId?: string) {
    if (this.config.apiMode === "trading") {
      return this.request({ method: "GET", path: "/v2/account" });
    }
    return this.request({
      method: "GET",
      path: `/v1/accounts/${encodeURIComponent(this.requireBrokerAccountId(accountId))}`,
    });
  }

  getTradingAccount(accountId?: string) {
    if (this.config.apiMode === "trading") {
      return this.request({ method: "GET", path: "/v2/account" });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(id)}/account`,
    });
  }

  listPositions(accountId?: string) {
    if (this.config.apiMode === "trading") {
      return this.request({ method: "GET", path: "/v2/positions" });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(id)}/positions`,
    });
  }

  getPosition(accountId: string | undefined, symbol: string) {
    if (this.config.apiMode === "trading") {
      return this.request({
        method: "GET",
        path: `/v2/positions/${encodeURIComponent(symbol)}`,
      });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(id)}/positions/${encodeURIComponent(symbol)}`,
    });
  }

  closePosition(accountId: string | undefined, symbol: string, query: Record<string, QueryValue> = {}) {
    if (this.config.apiMode === "trading") {
      return this.request({
        method: "DELETE",
        path: `/v2/positions/${encodeURIComponent(symbol)}`,
        query,
      });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "DELETE",
      path: `/v1/trading/accounts/${encodeURIComponent(id)}/positions/${encodeURIComponent(symbol)}`,
      query,
    });
  }

  listOrders(accountId: string | undefined, query: Record<string, QueryValue> = {}) {
    if (this.config.apiMode === "trading") {
      return this.request({ method: "GET", path: "/v2/orders", query });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(id)}/orders`,
      query,
    });
  }

  getOrder(accountId: string | undefined, orderId: string) {
    if (this.config.apiMode === "trading") {
      return this.request({
        method: "GET",
        path: `/v2/orders/${encodeURIComponent(orderId)}`,
      });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(id)}/orders/${encodeURIComponent(orderId)}`,
    });
  }

  createOrder(accountId: string | undefined, body: Record<string, unknown>) {
    if (this.config.apiMode === "trading") {
      return this.request({ method: "POST", path: "/v2/orders", body });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "POST",
      path: `/v1/trading/accounts/${encodeURIComponent(id)}/orders`,
      body,
    });
  }

  cancelOrder(accountId: string | undefined, orderId: string) {
    if (this.config.apiMode === "trading") {
      return this.request({
        method: "DELETE",
        path: `/v2/orders/${encodeURIComponent(orderId)}`,
      });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "DELETE",
      path: `/v1/trading/accounts/${encodeURIComponent(id)}/orders/${encodeURIComponent(orderId)}`,
    });
  }

  cancelAllOrders(accountId?: string) {
    if (this.config.apiMode === "trading") {
      return this.request({ method: "DELETE", path: "/v2/orders" });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "DELETE",
      path: `/v1/trading/accounts/${encodeURIComponent(id)}/orders`,
    });
  }

  listActivities(accountId: string | undefined, query: Record<string, QueryValue> = {}) {
    if (this.config.apiMode === "trading") {
      return this.request({ method: "GET", path: "/v2/account/activities", query });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "GET",
      path: `/v1/accounts/${encodeURIComponent(id)}/activities`,
      query,
    });
  }

  getPortfolioHistory(accountId: string | undefined, query: Record<string, QueryValue> = {}) {
    if (this.config.apiMode === "trading") {
      return this.request({ method: "GET", path: "/v2/account/portfolio/history", query });
    }
    const id = this.requireBrokerAccountId(accountId);
    return this.request({
      method: "GET",
      path: `/v1/trading/accounts/${encodeURIComponent(id)}/account/portfolio/history`,
      query,
    });
  }

  listAssets(query: Record<string, QueryValue> = {}) {
    const path = this.config.apiMode === "trading" ? "/v2/assets" : "/v1/assets";
    return this.request({ method: "GET", path, query });
  }

  getAsset(symbolOrId: string) {
    const root = this.config.apiMode === "trading" ? "/v2/assets" : "/v1/assets";
    return this.request({
      method: "GET",
      path: `${root}/${encodeURIComponent(symbolOrId)}`,
    });
  }

  getClock() {
    const path = this.config.apiMode === "trading" ? "/v2/clock" : "/v1/clock";
    return this.request({ method: "GET", path });
  }

  getCalendar(query: Record<string, QueryValue> = {}) {
    const path = this.config.apiMode === "trading" ? "/v2/calendar" : "/v1/calendar";
    return this.request({ method: "GET", path, query });
  }

  getStockSnapshot(symbol: string) {
    return this.request({
      method: "GET",
      path: `/v2/stocks/${encodeURIComponent(symbol)}/snapshot`,
      api: "data",
    });
  }
}

/** @deprecated Use AlpacaClient */
export const AlpacaBrokerClient = AlpacaClient;
