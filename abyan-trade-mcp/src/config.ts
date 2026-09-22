import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ApiMode = "broker" | "trading";
export type BrokerEnv = "sandbox" | "live";
export type TradingEnv = "paper" | "live";
export type AlpacaEnv = BrokerEnv | TradingEnv;

export interface Config {
  apiKey: string;
  apiSecret: string;
  apiMode: ApiMode;
  env: AlpacaEnv;
  apiBaseUrl: string;
  dataBaseUrl: string;
  credentialsPresent: boolean;
}

const BROKER_URLS: Record<BrokerEnv, { api: string; data: string }> = {
  sandbox: {
    api: "https://broker-api.sandbox.alpaca.markets",
    data: "https://data.sandbox.alpaca.markets",
  },
  live: {
    api: "https://broker-api.alpaca.markets",
    data: "https://data.alpaca.markets",
  },
};

const TRADING_URLS: Record<TradingEnv, { api: string; data: string }> = {
  paper: {
    api: "https://paper-api.alpaca.markets",
    data: "https://data.alpaca.markets",
  },
  live: {
    api: "https://api.alpaca.markets",
    data: "https://data.alpaca.markets",
  },
};

/** Load a local `.env` without overriding already-set process env (no extra dependency). */
export function applyDotEnv(cwd = process.cwd()): void {
  const file = resolve(cwd, ".env");
  if (!existsSync(file)) {
    return;
  }
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function stripSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function looksLikeTradingKey(key: string): boolean {
  return /^(PK|AK)/i.test(key);
}

export function resolveApiMode(env: NodeJS.ProcessEnv): ApiMode {
  const explicit = env.ALPACA_API_MODE?.trim().toLowerCase();
  if (explicit === "broker" || explicit === "trading") {
    return explicit;
  }
  if (explicit && explicit !== "auto") {
    throw new Error(`ALPACA_API_MODE must be "auto", "trading", or "broker", got ${JSON.stringify(env.ALPACA_API_MODE)}`);
  }
  if (env.ALPACA_TRADING_ENV?.trim()) {
    return "trading";
  }
  if (looksLikeTradingKey(env.ALPACA_API_KEY?.trim() ?? "")) {
    return "trading";
  }
  return "broker";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.ALPACA_API_KEY?.trim() ?? "";
  const apiSecret = env.ALPACA_API_SECRET?.trim() ?? "";
  const apiMode = resolveApiMode(env);

  if (apiMode === "trading") {
    const raw = (env.ALPACA_TRADING_ENV ?? (apiKey.toUpperCase().startsWith("PK") ? "paper" : "live"))
      .trim()
      .toLowerCase();
    if (raw !== "paper" && raw !== "live") {
      throw new Error(`ALPACA_TRADING_ENV must be "paper" or "live", got ${JSON.stringify(env.ALPACA_TRADING_ENV)}`);
    }
    const tradingEnv = raw as TradingEnv;
    return {
      apiKey,
      apiSecret,
      apiMode,
      env: tradingEnv,
      apiBaseUrl: stripSlash(env.ALPACA_TRADING_BASE_URL?.trim() || env.ALPACA_API_BASE_URL?.trim() || TRADING_URLS[tradingEnv].api),
      dataBaseUrl: stripSlash(env.ALPACA_DATA_BASE_URL?.trim() || TRADING_URLS[tradingEnv].data),
      credentialsPresent: Boolean(apiKey && apiSecret),
    };
  }

  const rawEnv = (env.ALPACA_BROKER_ENV ?? "sandbox").trim().toLowerCase();
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    throw new Error(`ALPACA_BROKER_ENV must be "sandbox" or "live", got ${JSON.stringify(env.ALPACA_BROKER_ENV)}`);
  }
  const brokerEnv = rawEnv as BrokerEnv;
  return {
    apiKey,
    apiSecret,
    apiMode,
    env: brokerEnv,
    apiBaseUrl: stripSlash(env.ALPACA_BROKER_BASE_URL?.trim() || env.ALPACA_API_BASE_URL?.trim() || BROKER_URLS[brokerEnv].api),
    dataBaseUrl: stripSlash(env.ALPACA_DATA_BASE_URL?.trim() || BROKER_URLS[brokerEnv].data),
    credentialsPresent: Boolean(apiKey && apiSecret),
  };
}

export function publicConfig(config: Config): {
  apiMode: ApiMode;
  env: AlpacaEnv;
  apiBaseUrl: string;
  dataBaseUrl: string;
  credentialsPresent: boolean;
} {
  return {
    apiMode: config.apiMode,
    env: config.env,
    apiBaseUrl: config.apiBaseUrl,
    dataBaseUrl: config.dataBaseUrl,
    credentialsPresent: config.credentialsPresent,
  };
}
