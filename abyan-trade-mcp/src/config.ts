import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type BrokerEnv = "sandbox" | "live";

export interface Config {
  apiKey: string;
  apiSecret: string;
  env: BrokerEnv;
  brokerBaseUrl: string;
  dataBaseUrl: string;
  credentialsPresent: boolean;
}

const DEFAULT_URLS: Record<BrokerEnv, { broker: string; data: string }> = {
  sandbox: {
    broker: "https://broker-api.sandbox.alpaca.markets",
    data: "https://data.sandbox.alpaca.markets",
  },
  live: {
    broker: "https://broker-api.alpaca.markets",
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const rawEnv = (env.ALPACA_BROKER_ENV ?? "sandbox").trim().toLowerCase();
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    throw new Error(`ALPACA_BROKER_ENV must be "sandbox" or "live", got ${JSON.stringify(env.ALPACA_BROKER_ENV)}`);
  }
  const brokerEnv = rawEnv as BrokerEnv;
  const apiKey = env.ALPACA_API_KEY?.trim() ?? "";
  const apiSecret = env.ALPACA_API_SECRET?.trim() ?? "";
  return {
    apiKey,
    apiSecret,
    env: brokerEnv,
    brokerBaseUrl: stripSlash(env.ALPACA_BROKER_BASE_URL?.trim() || DEFAULT_URLS[brokerEnv].broker),
    dataBaseUrl: stripSlash(env.ALPACA_DATA_BASE_URL?.trim() || DEFAULT_URLS[brokerEnv].data),
    credentialsPresent: Boolean(apiKey && apiSecret),
  };
}

export function publicConfig(config: Config): {
  env: BrokerEnv;
  brokerBaseUrl: string;
  dataBaseUrl: string;
  credentialsPresent: boolean;
} {
  return {
    env: config.env,
    brokerBaseUrl: config.brokerBaseUrl,
    dataBaseUrl: config.dataBaseUrl,
    credentialsPresent: config.credentialsPresent,
  };
}
