import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";
import { AlpacaClient, AlpacaError } from "./alpaca.js";
import type { Config } from "./config.js";
import { publicConfig } from "./config.js";

export const SERVER_NAME = "abyan-trade";
export const SERVER_VERSION = "0.2.0";

const accountId = z
  .string()
  .min(1)
  .optional()
  .describe("Broker API account UUID. Omit for Trading API paper/live (uses the authenticated account).");

function compact<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(err: unknown) {
  if (err instanceof AlpacaError) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              error: err.message,
              status: err.status,
              requestId: err.requestId,
              body: err.body,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

async function runTool(fn: () => Promise<unknown>) {
  try {
    return jsonResult(await fn());
  } catch (err) {
    return errorResult(err);
  }
}

function jsonResource(uri: URL, data: unknown) {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function createServer(
  config: Config,
  client: AlpacaClient = new AlpacaClient(config),
): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "get_server_status",
    {
      title: "Server status",
      description:
        "Show API mode (trading vs broker), environment (paper/sandbox/live), hosts, and whether credentials are set. Does not return secrets.",
      inputSchema: z.object({}),
    },
    async () => jsonResult(publicConfig(config)),
  );

  server.registerTool(
    "list_accounts",
    {
      title: "List accounts",
      description:
        "List accounts. Broker: GET /v1/accounts. Trading API: wraps GET /v2/account as a one-element list. KYC tax IDs are redacted.",
      inputSchema: z.object({
        query: z.string().optional().describe("Search string (email, name, account number)"),
        status: z.string().optional().describe("Account status filter, e.g. ACTIVE, APPROVED, SUBMITTED"),
        created_after: z.string().optional().describe("RFC3339 timestamp"),
        created_before: z.string().optional().describe("RFC3339 timestamp"),
        sort: z.enum(["asc", "desc"]).optional(),
        entities: z
          .string()
          .optional()
          .describe("Comma-separated extra entities, e.g. contact,identity,trading_configurations"),
      }),
    },
    async (args) => runTool(() => client.listAccounts(args)),
  );

  server.registerTool(
    "get_account",
    {
      title: "Get account",
      description:
        "Get an account. Broker: GET /v1/accounts/{account_id}. Trading API: GET /v2/account (account_id optional). KYC tax IDs are redacted.",
      inputSchema: z.object({ account_id: accountId }),
    },
    async ({ account_id }) => runTool(() => client.getAccount(account_id)),
  );

  server.registerTool(
    "get_trading_account",
    {
      title: "Get trading account",
      description:
        "Get trading balances and status. Broker: GET /v1/trading/accounts/{account_id}/account. Trading API: GET /v2/account.",
      inputSchema: z.object({ account_id: accountId }),
    },
    async ({ account_id }) => runTool(() => client.getTradingAccount(account_id)),
  );

  server.registerTool(
    "list_positions",
    {
      title: "List positions",
      description: "List open positions. Broker: GET /v1/trading/accounts/{account_id}/positions. Trading API: GET /v2/positions.",
      inputSchema: z.object({ account_id: accountId }),
    },
    async ({ account_id }) => runTool(() => client.listPositions(account_id)),
  );

  server.registerTool(
    "get_position",
    {
      title: "Get position",
      description: "Get an open position by symbol. Broker or Trading API /positions/{symbol}.",
      inputSchema: z.object({
        account_id: accountId,
        symbol: z.string().min(1).describe("Ticker symbol, e.g. AAPL"),
      }),
    },
    async ({ account_id, symbol }) => runTool(() => client.getPosition(account_id, symbol)),
  );

  server.registerTool(
    "close_position",
    {
      title: "Close position",
      description:
        "Liquidate an open position (DELETE .../positions/{symbol}). Uses a market order.",
      inputSchema: z.object({
        account_id: accountId,
        symbol: z.string().min(1),
        qty: z.string().optional().describe("Quantity to close; omit to close the full position"),
        percentage: z.string().optional().describe("Percentage of the position to close"),
      }),
    },
    async ({ account_id, symbol, qty, percentage }) =>
      runTool(() => client.closePosition(account_id, symbol, { qty, percentage })),
  );

  server.registerTool(
    "list_orders",
    {
      title: "List orders",
      description: "List orders. Broker: GET /v1/trading/accounts/{account_id}/orders. Trading API: GET /v2/orders.",
      inputSchema: z.object({
        account_id: accountId,
        status: z.enum(["open", "closed", "all"]).optional(),
        limit: z.number().int().positive().max(500).optional(),
        after: z.string().optional(),
        until: z.string().optional(),
        direction: z.enum(["asc", "desc"]).optional(),
        nested: z.boolean().optional(),
        symbols: z.string().optional().describe("Comma-separated symbols"),
      }),
    },
    async ({ account_id, ...query }) => runTool(() => client.listOrders(account_id, query)),
  );

  server.registerTool(
    "get_order",
    {
      title: "Get order",
      description: "Get a single order by id.",
      inputSchema: z.object({
        account_id: accountId,
        order_id: z.string().min(1),
      }),
    },
    async ({ account_id, order_id }) => runTool(() => client.getOrder(account_id, order_id)),
  );

  server.registerTool(
    "create_order",
    {
      title: "Create order",
      description:
        "Submit an equity order (POST /v2/orders or Broker POST /v1/trading/accounts/{account_id}/orders). Provide exactly one of qty or notional. Places an order on the configured environment.",
      inputSchema: z
        .object({
          account_id: accountId,
          symbol: z.string().min(1),
          side: z.enum(["buy", "sell"]),
          type: z.enum(["market", "limit", "stop", "stop_limit", "trailing_stop"]),
          time_in_force: z.enum(["day", "gtc", "opg", "cls", "ioc", "fok"]),
          qty: z.string().optional().describe("Share quantity, e.g. '1' or '0.5'"),
          notional: z.string().optional().describe("Dollar amount for fractional market orders, e.g. '25'"),
          limit_price: z.string().optional(),
          stop_price: z.string().optional(),
          trail_price: z.string().optional(),
          trail_percent: z.string().optional(),
          extended_hours: z.boolean().optional(),
          client_order_id: z.string().optional(),
        })
        .refine((value) => Boolean(value.qty) !== Boolean(value.notional), {
          message: "Provide exactly one of qty or notional",
        }),
    },
    async ({ account_id, ...order }) => runTool(() => client.createOrder(account_id, compact(order))),
  );

  server.registerTool(
    "cancel_order",
    {
      title: "Cancel order",
      description: "Cancel a single open order.",
      inputSchema: z.object({
        account_id: accountId,
        order_id: z.string().min(1),
      }),
    },
    async ({ account_id, order_id }) => runTool(() => client.cancelOrder(account_id, order_id)),
  );

  server.registerTool(
    "cancel_all_orders",
    {
      title: "Cancel all orders",
      description: "Cancel all open orders for the account.",
      inputSchema: z.object({ account_id: accountId }),
    },
    async ({ account_id }) => runTool(() => client.cancelAllOrders(account_id)),
  );

  server.registerTool(
    "list_account_activities",
    {
      title: "List account activities",
      description: "List fills, dividends, journals, and other activities.",
      inputSchema: z.object({
        account_id: accountId,
        activity_types: z.string().optional().describe("Comma-separated types, e.g. FILL,CSD,DIV,JNLC"),
        date: z.string().optional().describe("YYYY-MM-DD"),
        until: z.string().optional(),
        after: z.string().optional(),
        direction: z.enum(["asc", "desc"]).optional(),
        page_size: z.number().int().positive().max(100).optional(),
        page_token: z.string().optional(),
      }),
    },
    async ({ account_id, ...query }) => runTool(() => client.listActivities(account_id, query)),
  );

  server.registerTool(
    "get_portfolio_history",
    {
      title: "Get portfolio history",
      description:
        "Timeseries equity and P/L (Trading API GET /v2/account/portfolio/history, or Broker equivalent).",
      inputSchema: z.object({
        account_id: accountId,
        period: z.string().optional().describe("e.g. 1D, 1W, 1M, 3M, 1A, all"),
        timeframe: z.string().optional().describe("e.g. 1Min, 5Min, 15Min, 1H, 1D"),
        date_end: z.string().optional(),
        extended_hours: z.boolean().optional(),
      }),
    },
    async ({ account_id, ...query }) => runTool(() => client.getPortfolioHistory(account_id, query)),
  );

  server.registerTool(
    "list_assets",
    {
      title: "List assets",
      description:
        "List tradable assets (GET /v2/assets or /v1/assets). Defaults to active US equities. Optional symbol_prefix filters locally after the API response.",
      inputSchema: z.object({
        status: z.string().optional().describe("Default: active"),
        asset_class: z.string().optional().describe("Default: us_equity"),
        exchange: z.string().optional(),
        symbol_prefix: z.string().optional().describe("Case-insensitive symbol prefix filter applied locally"),
      }),
    },
    async ({ symbol_prefix, status, asset_class, exchange }) =>
      runTool(async () => {
        const assets = await client.listAssets({
          status: status ?? "active",
          asset_class: asset_class ?? "us_equity",
          exchange,
        });
        if (!symbol_prefix) {
          return assets;
        }
        const prefix = symbol_prefix.toUpperCase();
        if (!Array.isArray(assets)) {
          return assets;
        }
        return assets.filter((item) => {
          const symbol = typeof item === "object" && item && "symbol" in item ? String((item as { symbol: unknown }).symbol) : "";
          return symbol.toUpperCase().startsWith(prefix);
        });
      }),
  );

  server.registerTool(
    "get_asset",
    {
      title: "Get asset",
      description: "Get one asset by symbol or asset id (GET /v2/assets/{id} or /v1/assets/{id}).",
      inputSchema: z.object({
        symbol_or_asset_id: z.string().min(1).describe("Ticker like AAPL, or an asset UUID"),
      }),
    },
    async ({ symbol_or_asset_id }) => runTool(() => client.getAsset(symbol_or_asset_id)),
  );

  server.registerTool(
    "get_clock",
    {
      title: "Market clock",
      description: "US equity market clock: open/closed and next open/close (GET /v2/clock or /v1/clock).",
      inputSchema: z.object({}),
    },
    async () => runTool(() => client.getClock()),
  );

  server.registerTool(
    "get_calendar",
    {
      title: "Market calendar",
      description: "Market calendar for a date range (GET /v2/calendar or /v1/calendar).",
      inputSchema: z.object({
        start: z.string().optional().describe("YYYY-MM-DD"),
        end: z.string().optional().describe("YYYY-MM-DD"),
      }),
    },
    async (query) => runTool(() => client.getCalendar(query)),
  );

  server.registerTool(
    "get_stock_snapshot",
    {
      title: "Stock snapshot",
      description:
        "Latest trade, quote, and minute/daily bars for a US equity (GET /v2/stocks/{symbol}/snapshot on Alpaca Market Data).",
      inputSchema: z.object({
        symbol: z.string().min(1),
      }),
    },
    async ({ symbol }) => runTool(() => client.getStockSnapshot(symbol)),
  );

  server.registerResource(
    "status",
    "abyan://status",
    {
      title: "Abyan Trade MCP status",
      description: "Environment and whether credentials are set (no secrets).",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri, publicConfig(config)),
  );

  server.registerResource(
    "clock",
    "abyan://clock",
    {
      title: "Market clock",
      description: "US equity market clock from Alpaca.",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri, await client.getClock()),
  );

  server.registerResource(
    "accounts",
    "abyan://accounts",
    {
      title: "Accounts",
      description: "Accounts for this API mode (Trading API returns the authenticated account).",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri, await client.listAccounts()),
  );

  server.registerResource(
    "account-self",
    "abyan://account",
    {
      title: "Authenticated account",
      description: "The Trading API account, or an error on Broker API until an account id is provided in the template URI.",
      mimeType: "application/json",
    },
    async (uri) => jsonResource(uri, await client.getAccount()),
  );

  server.registerResource(
    "account",
    new ResourceTemplate("abyan://account/{account_id}", { list: undefined }),
    {
      title: "Account",
      description: "A single brokerage account.",
      mimeType: "application/json",
    },
    async (uri, variables) => jsonResource(uri, await client.getAccount(String(variables.account_id))),
  );

  server.registerResource(
    "account-positions",
    new ResourceTemplate("abyan://account/{account_id}/positions", { list: undefined }),
    {
      title: "Account positions",
      mimeType: "application/json",
    },
    async (uri, variables) => jsonResource(uri, await client.listPositions(String(variables.account_id))),
  );

  server.registerResource(
    "account-orders",
    new ResourceTemplate("abyan://account/{account_id}/orders", { list: undefined }),
    {
      title: "Account orders",
      mimeType: "application/json",
    },
    async (uri, variables) => jsonResource(uri, await client.listOrders(String(variables.account_id), { status: "open" })),
  );

  server.registerResource(
    "asset",
    new ResourceTemplate("abyan://asset/{symbol}", { list: undefined }),
    {
      title: "Asset",
      mimeType: "application/json",
    },
    async (uri, variables) => jsonResource(uri, await client.getAsset(String(variables.symbol))),
  );

  return server;
}
