# Abyan Trade MCP

MCP server for [Abyan Trade](https://www.abyancapital.sa/). It talks to [Alpaca Broker API](https://docs.alpaca.markets/us/docs/getting-started-with-broker-api) — the brokerage infrastructure Abyan uses — not a public Abyan developer API.

This package lives next to the Whisper tree; it does not change Whisper.

## Setup

Needs Node 20+. Broker API keys come from [Alpaca Brokerdash](https://docs.alpaca.markets/us/docs/getting-started-with-broker-api) (`API_KEY` / `API_SECRET`). These are correspondent Broker credentials (HTTP Basic), not Trading API paper keys.

```bash
cd abyan-trade-mcp
npm install
cp .env.example .env   # then fill ALPACA_API_KEY and ALPACA_API_SECRET
npm test
npm run build
```

## Run

Stdio (what Cursor and other MCP hosts launch):

```bash
# from abyan-trade-mcp, with .env or exported vars
npm start              # node dist/index.js  (after npm run build)
# or
npm run dev            # tsx src/index.ts
```

Environment:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALPACA_API_KEY` | (required for API calls) | Brokerdash key id |
| `ALPACA_API_SECRET` | (required for API calls) | Brokerdash secret |
| `ALPACA_BROKER_ENV` | `sandbox` | `sandbox` or `live` |
| `ALPACA_BROKER_BASE_URL` | sandbox/live Broker host | optional override |
| `ALPACA_DATA_BASE_URL` | sandbox/live Market Data host | optional override |

Sandbox Broker host: `https://broker-api.sandbox.alpaca.markets`  
Live Broker host: `https://broker-api.alpaca.markets`

The process waits on stdin. Log lines go to stderr so they do not break JSON-RPC.

### Cursor

In MCP settings, point at the built entry (or `tsx` during development):

```json
{
  "mcpServers": {
    "abyan-trade": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/abyan-trade-mcp",
      "env": {
        "ALPACA_API_KEY": "your-key",
        "ALPACA_API_SECRET": "your-secret",
        "ALPACA_BROKER_ENV": "sandbox"
      }
    }
  }
}
```

Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Tools

| Tool | Alpaca |
| --- | --- |
| `get_server_status` | local (env + whether credentials are set) |
| `list_accounts` | `GET /v1/accounts` |
| `get_account` | `GET /v1/accounts/{account_id}` |
| `get_trading_account` | `GET /v1/trading/accounts/{account_id}/account` |
| `list_positions` | `GET /v1/trading/accounts/{account_id}/positions` |
| `get_position` | `GET /v1/trading/accounts/{account_id}/positions/{symbol}` |
| `close_position` | `DELETE /v1/trading/accounts/{account_id}/positions/{symbol}` |
| `list_orders` | `GET /v1/trading/accounts/{account_id}/orders` |
| `get_order` | `GET /v1/trading/accounts/{account_id}/orders/{order_id}` |
| `create_order` | `POST /v1/trading/accounts/{account_id}/orders` |
| `cancel_order` | `DELETE /v1/trading/accounts/{account_id}/orders/{order_id}` |
| `cancel_all_orders` | `DELETE /v1/trading/accounts/{account_id}/orders` |
| `list_account_activities` | `GET /v1/accounts/{account_id}/activities` |
| `get_portfolio_history` | `GET /v1/trading/accounts/{account_id}/account/portfolio/history` |
| `list_assets` | `GET /v1/assets` |
| `get_asset` | `GET /v1/assets/{symbol_or_asset_id}` |
| `get_clock` | `GET /v1/clock` |
| `get_calendar` | `GET /v1/calendar` |
| `get_stock_snapshot` | `GET /v2/stocks/{symbol}/snapshot` (Market Data) |

`create_order` / `close_position` / cancel tools place or cancel orders on the configured Alpaca environment.

## Resources

| URI | Content |
| --- | --- |
| `abyan://status` | env + credential presence |
| `abyan://clock` | market clock |
| `abyan://accounts` | account list |
| `abyan://account/{account_id}` | one account |
| `abyan://account/{account_id}/positions` | open positions |
| `abyan://account/{account_id}/orders` | open orders |
| `abyan://asset/{symbol}` | asset metadata |

Account responses redact `tax_id`, document `content`, and bank account numbers.

## Auth

US Broker API: HTTP Basic, username = key, password = secret. Generate keys in Brokerdash. Do not commit `.env`.
