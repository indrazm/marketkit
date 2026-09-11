/**
 * Index data APIs (premium): DJI, S&P 500, Nasdaq, VIX, Russell 2000 and the
 * index catalog utility.
 */

import { type MarketResponse, ParseError, type RequestOptions } from "@marketkit/core";

import { type AlphaVantageApi, type AlphaVantageMetaFields, envelope, parseMeta } from "./api.js";
import type { IndexCandle, IndexEntry, IndexHistoryOptions, IndexInterval } from "./types.js";
import { deepNormalize, isRecord, numeric, optionalNumber, parseTimestamp } from "./normalize.js";

/** Well-known index symbols accepted by `INDEX_DATA`. */
export type IndexSymbol =
  | "DJI"
  | "SPX"
  | "NDX"
  | "NDX100"
  | "VIX"
  | "RUT"
  | "FTSE"
  | "DAX"
  | "CAC40"
  | "IBEX35"
  | "NIKKEI225"
  | "HSI"
  | "SHANGHAI"
  | "KOSPI"
  | (string & {});

export class IndexesNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  /** `INDEX_DATA` — OHLC series for a market index. */
  async history(
    symbolOrOptions: IndexSymbol | IndexHistoryOptions,
    maybeInterval?: IndexInterval,
    maybeOptions?: RequestOptions,
  ): Promise<MarketResponse<IndexCandle[], AlphaVantageMetaFields>> {
    const symbol = typeof symbolOrOptions === "string" ? symbolOrOptions : symbolOrOptions.symbol;
    const interval = typeof symbolOrOptions === "string" ? maybeInterval : symbolOrOptions.interval;
    const options = typeof symbolOrOptions === "string" ? maybeOptions : symbolOrOptions;
    if (!interval) {
      throw new ParseError("alphavantage: index history: interval is required", {
        field: "interval",
      });
    }
    const payload = await this.api.get({ function: "INDEX_DATA", symbol, interval }, options);
    const meta = parseMeta(payload, symbol);
    const series = findTimeSeries(payload);
    if (!series) {
      throw new ParseError("alphavantage: index history: no time-series section in response", {
        field: "Time Series",
      });
    }
    const data = Object.entries(series)
      .map(([timestamp, row]) => {
        if (!isRecord(row)) {
          throw new ParseError(`alphavantage: index history: expected object row at ${timestamp}`, {
            field: "Time Series",
          });
        }
        const close = firstNumber(row, ["close", "4. close", "value"]);
        return {
          timestamp: parseTimestamp(timestamp),
          open: optionalNumber(normalizeKeysLower(row), "open") ?? undefined,
          high: optionalNumber(normalizeKeysLower(row), "high") ?? undefined,
          low: optionalNumber(normalizeKeysLower(row), "low") ?? undefined,
          close,
        } satisfies IndexCandle;
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return envelope(data, meta);
  }

  /** `INDEX_CATALOG` — list of supported indices. */
  async catalog(
    options?: RequestOptions,
  ): Promise<MarketResponse<IndexEntry[], AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "INDEX_CATALOG" }, options);
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data
        : (Object.values(payload as Record<string, unknown>).find((value): value is unknown[] =>
            Array.isArray(value),
          ) ?? []);
    const data = rows.map((row) => {
      if (!isRecord(row)) {
        throw new ParseError("alphavantage: index catalog: expected object row", {
          field: "catalog",
        });
      }
      const normalized = deepNormalize(row);
      for (const [key, value] of Object.entries(normalized as Record<string, unknown>)) {
        (normalized as Record<string, unknown>)[key] =
          typeof value === "string" || typeof value === "number" ? numeric(value) : value;
      }
      return normalized as IndexEntry;
    });
    return envelope(data, parseMeta(payload));
  }
}

function findTimeSeries(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload)) return undefined;
  for (const [key, value] of Object.entries(payload)) {
    if (key.toLowerCase().includes("time series") && isRecord(value)) return value;
  }
  return undefined;
}

function normalizeKeysLower(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key.toLowerCase().replace(/[^a-z]/g, "")] = value;
  }
  return out;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number {
  const lowered = normalizeKeysLower(record);
  for (const key of keys) {
    const value = lowered[key.toLowerCase().replace(/[^a-z]/g, "")];
    const parsed = typeof value === "string" ? Number(value) : value;
    if (typeof parsed === "number" && Number.isFinite(parsed)) return parsed;
  }
  throw new ParseError("alphavantage: index history: missing close value", { field: "close" });
}
