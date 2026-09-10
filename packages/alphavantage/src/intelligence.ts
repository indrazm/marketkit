/**
 * Alpha Intelligence beyond news: earnings-call transcripts, top movers helper,
 * insider transactions, congressional trades, politician metadata,
 * institutional holdings and fixed/sliding-window analytics.
 */

import { MarketResponse, ParseError, RequestOptions } from "@marketkit/core";

import { AlphaVantageApi, AlphaVantageMetaFields, envelope, parseMeta } from "./api.js";
import type {
  AnalyticsOptions,
  AnalyticsResult,
  CongressTradesOptions,
  InsiderTransactionsOptions,
  TranscriptOptions,
} from "./types.js";
import { deepNormalize } from "./normalize.js";

/** Loose intelligence payloads: keys normalized, numerics coerced. */
export type IntelligenceRecord = Record<string, unknown>;

export class IntelligenceNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  /** `EARNINGS_CALL_TRANSCRIPT` — quarter as `"2024Q1"` or `{ year, quarter }`. */
  async transcript(
    options: TranscriptOptions,
  ): Promise<MarketResponse<IntelligenceRecord, AlphaVantageMetaFields>> {
    const quarter =
      typeof options.quarter === "string"
        ? options.quarter
        : `${options.quarter.year}Q${options.quarter.quarter}`;
    const payload = await this.api.get(
      { function: "EARNINGS_CALL_TRANSCRIPT", symbol: options.symbol, quarter },
      options,
    );
    return envelope(
      deepNormalize(payload) as IntelligenceRecord,
      parseMeta(payload, options.symbol),
    );
  }

  /** `INSIDER_TRANSACTIONS` — normalized rows under `data`. */
  async insiderTransactions(
    options: InsiderTransactionsOptions,
  ): Promise<MarketResponse<IntelligenceRecord, AlphaVantageMetaFields>> {
    const payload = await this.api.get(
      { function: "INSIDER_TRANSACTIONS", symbol: options.symbol, from: options.from },
      options,
    );
    return envelope(
      deepNormalize(payload) as IntelligenceRecord,
      parseMeta(payload, options.symbol),
    );
  }

  /** `CONGRESS_TRADES` — by symbol and/or politician `bioguideId`. */
  async congressTrades(
    options: CongressTradesOptions,
  ): Promise<MarketResponse<IntelligenceRecord | IntelligenceRecord[], AlphaVantageMetaFields>> {
    if (!options.symbol && !options.bioguideId) {
      throw new ParseError("alphavantage: congressTrades: symbol or bioguideId is required", {
        field: "symbol",
      });
    }
    const payload = await this.api.get(
      {
        function: "CONGRESS_TRADES",
        symbol: options.symbol,
        bioguide_id: options.bioguideId,
      },
      options,
    );
    return envelope(
      deepNormalize(payload) as IntelligenceRecord | IntelligenceRecord[],
      parseMeta(payload, options.symbol),
    );
  }

  /** `POLITICIAN_METADATA` — mapping of politicians to bioguide ids. */
  async politicianMetadata(
    options?: RequestOptions,
  ): Promise<MarketResponse<IntelligenceRecord | IntelligenceRecord[], AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "POLITICIAN_METADATA" }, options);
    return envelope(
      deepNormalize(payload) as IntelligenceRecord | IntelligenceRecord[],
      parseMeta(payload),
    );
  }

  /** `INSTITUTIONAL_HOLDINGS` — 13F-style holdings for a ticker. */
  async institutionalHoldings(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<IntelligenceRecord, AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "INSTITUTIONAL_HOLDINGS", symbol }, options);
    return envelope(deepNormalize(payload) as IntelligenceRecord, parseMeta(payload, symbol));
  }

  /**
   * `ANALYTICS_FIXED_WINDOW` / `ANALYTICS_SLIDING_WINDOW` — sliding window is
   * selected by passing `window`. Calculations strings pass through verbatim,
   * e.g. `"STDDEV(annualized=True)"` or `"MIN,MAX,CUMULATIVE_RETURN"`.
   */
  async analytics(
    options: AnalyticsOptions,
  ): Promise<MarketResponse<AnalyticsResult, AlphaVantageMetaFields>> {
    const fn = options.window === undefined ? "ANALYTICS_FIXED_WINDOW" : "ANALYTICS_SLIDING_WINDOW";
    const ranges = Array.isArray(options.range) ? options.range : [options.range];
    const params: Record<string, string | number | undefined> = {
      function: fn,
      SYMBOLS: options.symbols.join(","),
      INTERVAL: options.interval.toUpperCase() === "1D" ? "DAILY" : mapInterval(options.interval),
      OHLC: options.ohlc ?? "close",
      CALCULATIONS: options.calculations,
      WINDOW: options.window,
    };
    // The provider takes two RANGE parameters for a start/end pair.
    const query = buildAnalyticsQuery(params, ranges);
    const payload = await this.api.rawGet(query, options);
    return envelope(deepNormalize(payload) as AnalyticsResult, parseMeta(payload));
  }
}

function mapInterval(interval: AnalyticsOptions["interval"]): string {
  const map: Record<string, string> = {
    "1m": "1min",
    "5m": "5min",
    "15m": "15min",
    "30m": "30min",
    "60m": "60min",
    "1d": "DAILY",
    "1w": "WEEKLY",
    "1mo": "MONTHLY",
  };
  return map[interval] ?? interval.toUpperCase();
}

/** Analytics needs a repeated RANGE parameter, so the query is built here. */
function buildAnalyticsQuery(
  params: Record<string, string | number | undefined>,
  ranges: string[],
): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  for (const range of ranges) search.append("RANGE", range);
  return search;
}
