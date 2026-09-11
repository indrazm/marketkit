/**
 * Query layer: `https://query{1,2}.finance.yahoo.com/<path>` with a
 * browser-like `User-Agent` (Yahoo rejects default fetch agents with
 * 401/429). No API key — Yahoo is keyless with rate limits.
 */

import { NotFoundError, ParseError, type Transport } from "@marketkit/core";
import { isRecord, optionalNumber } from "./shared.js";
import type { Candle, CorporateActions, Dividend, Split } from "./types.js";

export const QUERY1_URL = "https://query1.finance.yahoo.com";
export const QUERY2_URL = "https://query2.finance.yahoo.com";

/** Default browser-like agent; override per client when embedding. */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface YahooApiOptions {
  transport: Transport;
  userAgent?: string;
}

export class YahooApi {
  readonly #transport: Transport;
  readonly #userAgent: string;

  constructor(options: YahooApiOptions) {
    this.#transport = options.transport;
    this.#userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  async get<T>(
    host: string,
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    const suffix = search.size > 0 ? `/${path}?${search}` : `/${path}`;
    return this.#transport.json<T>(`${host}${suffix}`, {
      headers: { "User-Agent": this.#userAgent },
      signal: options?.signal,
    });
  }

  async getQuery1<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    return this.get<T>(QUERY1_URL, path, params, options);
  }

  async getQuery2<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    return this.get<T>(QUERY2_URL, path, params, options);
  }
}

/** Meta object produced by the per-namespace `meta(...)` helpers. */
export interface YahooMetaLite {
  provider: "yfinance";
  fetchedAt: Date;
  exchange?: string;
  currency?: string;
}

/** Build the standard `{ data, meta }` envelope from a meta object. */
export function envelope<T>(data: T, metaObj: YahooMetaLite): { data: T; meta: YahooMetaLite } {
  return { data, meta: metaObj };
}

function chartResult(payload: unknown, context: string): Record<string, unknown> {
  const chart = isRecord(payload) ? payload.chart : undefined;
  const results = isRecord(chart) ? chart.result : undefined;
  if (!Array.isArray(results) || results.length === 0 || !isRecord(results[0])) {
    throw new NotFoundError(`yfinance: ${context}: no chart result in response`, {
      provider: "yfinance",
    });
  }
  return results[0];
}

function numArray(value: unknown): Array<number | null> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "number" && Number.isFinite(item) ? item : null));
}

/**
 * Chart `result[0]` → newest-first candles. `timestamp` is epoch seconds;
 * indicator columns align by index. Null OHLC rows (market holidays inside an
 * intraday window) are skipped rather than surfaced as zero bars.
 */
export function parseChartCandles(payload: unknown, context: string): Candle[] {
  const result = chartResult(payload, context);
  const timestamps = Array.isArray(result.timestamp)
    ? result.timestamp.filter((t): t is number => typeof t === "number")
    : [];
  const indicators = isRecord(result.indicators) ? result.indicators : {};
  const quoteRow = Array.isArray(indicators.quote) ? indicators.quote[0] : undefined;
  const q = isRecord(quoteRow) ? quoteRow : {};
  const opens = numArray(q.open);
  const highs = numArray(q.high);
  const lows = numArray(q.low);
  const closes = numArray(q.close);
  const volumes = numArray(q.volume);
  const adjRow = Array.isArray(indicators.adjclose) ? indicators.adjclose[0] : undefined;
  const adjCloses = isRecord(adjRow) ? numArray(adjRow.adjclose) : [];
  const events = isRecord(result.events) ? result.events : {};
  const dividendRows = isRecord(events.dividends)
    ? (events.dividends as Record<string, unknown>)
    : {};
  const splitRows = isRecord(events.splits) ? (events.splits as Record<string, unknown>) : {};
  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    if (open === null || open === undefined) continue;
    if (high == null || low == null || close == null) {
      throw new ParseError(`yfinance: ${context}: incomplete bar at index ${i}`, {
        field: "o/h/l/c",
      });
    }
    const candle: Candle = {
      timestamp: new Date(timestamps[i] * 1000),
      open,
      high,
      low,
      close,
    };
    const volume = volumes[i];
    if (typeof volume === "number") candle.volume = volume;
    const adjClose = adjCloses[i];
    if (typeof adjClose === "number") candle.adjClose = adjClose;
    const tsKey = String(timestamps[i]);
    const divRow = dividendRows[tsKey];
    if (isRecord(divRow)) {
      const amount = optionalNumber(divRow.amount);
      if (amount !== undefined) candle.dividend = amount;
    }
    const splitRow = splitRows[tsKey];
    if (isRecord(splitRow)) {
      const numerator = optionalNumber(splitRow.numerator);
      const denominator = optionalNumber(splitRow.denominator);
      if (numerator !== undefined && denominator !== undefined) {
        candle.split = {
          numerator,
          denominator,
          ratio: typeof splitRow.splitRatio === "string" ? splitRow.splitRatio : "",
        };
      }
    }
    candles.push(candle);
  }
  return candles.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/** Chart `events` block → standalone corporate-action lists. */
export function parseChartActions(payload: unknown, context: string): CorporateActions {
  const result = chartResult(payload, context);
  const events = isRecord(result.events) ? result.events : {};
  const dividends: Dividend[] = [];
  if (isRecord(events.dividends)) {
    for (const [ts, row] of Object.entries(events.dividends)) {
      const amount = isRecord(row) ? optionalNumber(row.amount) : undefined;
      const at = Number(ts);
      if (amount !== undefined && Number.isFinite(at)) {
        dividends.push({ timestamp: new Date(at * 1000), amount });
      }
    }
  }
  const splits: Split[] = [];
  if (isRecord(events.splits)) {
    for (const [ts, row] of Object.entries(events.splits)) {
      const at = Number(ts);
      if (!isRecord(row) || !Number.isFinite(at)) continue;
      const numerator = optionalNumber(row.numerator);
      const denominator = optionalNumber(row.denominator);
      if (numerator === undefined || denominator === undefined) continue;
      splits.push({
        timestamp: new Date(at * 1000),
        numerator,
        denominator,
        ratio: typeof row.splitRatio === "string" ? row.splitRatio : "",
      });
    }
  }
  const byTime = (a: { timestamp: Date }, b: { timestamp: Date }) =>
    b.timestamp.getTime() - a.timestamp.getTime();
  return { dividends: dividends.sort(byTime), splits: splits.sort(byTime) };
}

/** Chart `meta` → envelope meta (exchange/currency travel with every chart). */
export function chartMeta(payload: unknown): { exchange?: string; currency?: string } {
  const result = isRecord(payload)
    ? (() => {
        try {
          return chartResult(payload, "meta");
        } catch {
          return {};
        }
      })()
    : {};
  const meta = isRecord(result.meta) ? result.meta : {};
  return {
    exchange: typeof meta.exchangeName === "string" ? meta.exchangeName : undefined,
    currency: typeof meta.currency === "string" ? meta.currency : undefined,
  };
}
