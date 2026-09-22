# Abyan Trade MCP

MCP server for [Abyan Trade](https://www.abyancapital.sa/). It talks to Alpaca — [Trading API](https://docs.alpaca.markets/docs/trading-api) (paper/live dashboard keys, `PK…`/`AK…`) or [Broker API](https://docs.alpaca.markets/us/docs/getting-started-with-broker-api) (Brokerdash correspondent keys).

This package lives next to the Whisper tree; it does not change Whisper.

## Setup

Needs Node 20+.

```bash
cd abyan-trade-mcp
npm install
cp .env.example .env   # then fill ALPACA_API_KEY and ALPACA_API_SECRET
npm test
npm run build
```

`ALPACA_API_MODE` defaults to `auto`: keys starting with `PK`/`AK`, or `ALPACA_TRADING_ENV` set, use Trading API. Anything else uses Broker API.

## Run

```bash
npm start              # node dist/index.js  (after npm run build)
# or
npm run dev            # tsx src/index.ts
```

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALPACA_API_KEY` | (required for API calls) | Trading API key (`PK…` paper / `AK…` live) or Brokerdash key |
| `ALPACA_API_SECRET` | (required for API calls) | matching secret |
| `ALPACA_API_MODE` | `auto` | `auto`, `trading`, or `broker` |
| `ALPACA_TRADING_ENV` | `paper` if key is `PK…`, else `live` | Trading API: `paper` or `live` |
| `ALPACA_BROKER_ENV` | `sandbox` | Broker API: `sandbox` or `live` |
| `ALPACA_TRADING_BASE_URL` / `ALPACA_BROKER_BASE_URL` | host for that mode | optional override |
| `ALPACA_DATA_BASE_URL` | Market Data host for the mode | optional override |

Paper Trading host: `https://paper-api.alpaca.markets` (header auth `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY`).  
Broker sandbox host: `https://broker-api.sandbox.alpaca.markets` (HTTP Basic).

Stdout is JSON-RPC; logs go to stderr.

### Cursor

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
        "ALPACA_TRADING_ENV": "paper"
      }
    }
  }
}
```

For Brokerdash keys, set `ALPACA_API_MODE=broker` and `ALPACA_BROKER_ENV=sandbox` instead of `ALPACA_TRADING_ENV`.

## Tools

Same tool names in both modes. Trading API uses `/v2/...` on the paper/live host and does not need `account_id`. Broker API uses `/v1/...` and needs `account_id`.

`get_server_status`, `list_accounts`, `get_account`, `get_trading_account`, `list_positions`, `get_position`, `close_position`, `list_orders`, `get_order`, `create_order`, `cancel_order`, `cancel_all_orders`, `list_account_activities`, `get_portfolio_history`, `list_assets`, `get_asset`, `get_clock`, `get_calendar`, `get_stock_snapshot`.

`create_order` / `close_position` / cancel tools place or cancel orders on the configured environment.

## Resources

`abyan://status`, `abyan://clock`, `abyan://accounts`, `abyan://account`, `abyan://account/{account_id}`, `abyan://account/{account_id}/positions`, `abyan://account/{account_id}/orders`, `abyan://asset/{symbol}`.

Account responses redact `tax_id`, document `content`, and bank account numbers. Do not commit `.env`.
