/**
 * PRD §8–§13: stocks domain. Hides GLOBAL_QUOTE / TIME_SERIES_* / SYMBOL_SEARCH
 * / MARKET_STATUS / REALTIME_BULK_QUOTES behind domain methods.
 */

import { MarketResponse, ParseError, RequestOptions } from "@marketkit/core";

import { AlphaVantageApi, AlphaVantageMetaFields, envelope, parseMeta } from "./api.js";
import type {
  BidAskQuote,
  Candle,
  Entitlement,
  HistoryOptions,
  Instrument,
  MarketStatusDay,
  Mover,
  SearchOptions,
  StockHistoryMeta,
  StockInterval,
  StockQuote,
  TopMovers,
} from "./types.js";
import {
  describe,
  findRecordSection,
  isRecord,
  normalizeKey,
  numeric,
  optionalNumber,
  optionalString,
  recordToCandle,
  requireNumber,
  deepNormalize,
} from "./normalize.js";
import { requireNonEmptyPayload } from "./classify.js";

const INTRADAY_MAP: Partial<Record<StockInterval, string>> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "60m": "60min",
};

const INTERVAL_LABEL: Record<StockInterval, string> = {
  "1m": "",
  "5m": "",
  "15m": "",
  "30m": "",
  "60m": "",
  "1d": "Daily",
  "1w": "Weekly",
  "1mo": "Monthly",
};

export class StocksNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  /** PRD §8: `GLOBAL_QUOTE` → `StockQuote`. */
  async quote(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<StockQuote, StockHistoryMeta>> {
    const payload = await this.api.get({ function: "GLOBAL_QUOTE", symbol }, options);
    const section = findRecordSection(
      requireNonEmptyPayload(payload, `quote(${symbol})`),
      "globalquote",
    );
    if (!section) {
      throw new ParseError(`alphavantage: quote(${symbol}): missing quote section`, {
        field: "Global Quote",
      });
    }
    const meta = { ...parseMeta(payload, symbol) };
    const quote: StockQuote = {
      symbol: optionalString(section, "symbol") ?? symbol,
      price: requireNumber(section, "price"),
      open: requireNumber(section, "open"),
      high: requireNumber(section, "high"),
      low: requireNumber(section, "low"),
      previousClose: requireNumber(section, "previousclose"),
      change: requireNumber(section, "change"),
      changePercent: requireNumber(section, "changepercent"),
      volume: requireNumber(section, "volume"),
      latestTradingDay: optionalString(section, "latesttradingday") ?? "",
    };
    return envelope(quote, meta);
  }

  /** PRD §12: up to 100 symbols in one call (`REALTIME_BULK_QUOTES`). */
  async quotes(
    symbols: string[],
    options?: RequestOptions,
  ): Promise<MarketResponse<StockQuote[], StockHistoryMeta>> {
    const payload = await this.api.get(
      { function: "REALTIME_BULK_QUOTES", symbol: symbols.join(",") },
      options,
    );
    const rows = findArrayValue(payload, "intradayprices");
    const data = rows.map((row) => {
      if (!isRecord(row)) {
        throw new ParseError(`alphavantage: quotes: expected object row, got ${describe(row)}`, {
          field: "Intraday Prices",
        });
      }
      return {
        symbol: optionalString(row, "symbol") ?? "",
        price: optionalNumber(row, "close", "last") ?? 0,
        open: optionalNumber(row, "open") ?? 0,
        high: optionalNumber(row, "high") ?? 0,
        low: optionalNumber(row, "low") ?? 0,
        previousClose: optionalNumber(row, "previousclose") ?? 0,
        change: optionalNumber(row, "change") ?? 0,
        changePercent: optionalNumber(row, "changepercent") ?? 0,
        volume: optionalNumber(row, "volume") ?? 0,
        latestTradingDay: optionalString(row, "latesttradingday", "timestamp", "time") ?? "",
      } satisfies StockQuote;
    });
    return envelope(data, { ...parseMeta(payload) });
  }

  /**
   * PRD §9/§10: one `history()` across intraday/daily/weekly/monthly, with the
   * adjusted variants selected via `adjusted: true`.
   */
  async history(
    symbol: string,
    options: HistoryOptions,
  ): Promise<MarketResponse<Candle[], StockHistoryMeta>> {
    const { interval, adjusted, outputsize, extendedHours, month, entitlement } = options;
    const params: Record<string, string | number | undefined> = { symbol };
    if (INTRADAY_MAP[interval]) {
      params.function = "TIME_SERIES_INTRADAY";
      params.interval = INTRADAY_MAP[interval];
      if (adjusted === false) params.adjusted = "false";
      if (extendedHours === false) params.extended_hours = "false";
      if (month) params.month = month;
    } else {
      const label = INTERVAL_LABEL[interval];
      params.function = adjusted
        ? `TIME_SERIES_${label.toUpperCase()}_ADJUSTED`
        : `TIME_SERIES_${label.toUpperCase()}`;
    }
    if (outputsize) params.outputsize = outputsize;
    if (entitlement) params.entitlement = entitlement;
    const payload = await this.api.get(params, options);
    const series = findSeriesSection(payload);
    if (!series) {
      throw new ParseError(`alphavantage: history(${symbol}): no time-series section in response`, {
        field: "Time Series",
      });
    }
    const data = Object.entries(series)
      .map(([timestamp, row]) => {
        if (!isRecord(row)) {
          throw new ParseError(`alphavantage: history: expected object row at ${timestamp}`, {
            field: "Time Series",
          });
        }
        return recordToCandle<Candle>(row, timestamp);
      })
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    const meta: StockHistoryMeta = {
      ...parseMeta(payload, symbol),
      interval,
      adjusted,
    };
    return envelope(data, meta);
  }

  /** PRD §11: `SYMBOL_SEARCH`. */
  async search(
    queryOrOptions: string | SearchOptions,
    maybeOptions?: RequestOptions,
  ): Promise<MarketResponse<Instrument[], AlphaVantageMetaFields>> {
    const query = typeof queryOrOptions === "string" ? queryOrOptions : queryOrOptions.query;
    const options = typeof queryOrOptions === "string" ? maybeOptions : queryOrOptions;
    const payload = await this.api.get({ function: "SYMBOL_SEARCH", keywords: query }, options);
    const rows = findArrayValue(payload, "bestmatches");
    const data = rows.map((row) => {
      if (!isRecord(row)) {
        throw new ParseError(`alphavantage: search: expected object row, got ${describe(row)}`, {
          field: "bestMatches",
        });
      }
      const score = optionalNumber(row, "matchscore");
      return {
        symbol: optionalString(row, "symbol") ?? "",
        name: optionalString(row, "name") ?? "",
        type: optionalString(row, "type"),
        region: optionalString(row, "region"),
        currency: optionalString(row, "currency"),
        marketOpen: optionalString(row, "marketopen"),
        marketClose: optionalString(row, "marketclose"),
        timezone: optionalString(row, "timezone"),
        matchScore: score,
      } satisfies Instrument;
    });
    return envelope(data, parseMeta(payload));
  }

  /** Realtime bulk bid & ask (Level 2 top-of-book, premium). */
  async bidAsk(
    symbolsOrOptions: string[] | { symbols: string[] },
    maybeOptions?: RequestOptions,
  ): Promise<MarketResponse<BidAskQuote[], AlphaVantageMetaFields>> {
    const symbols = Array.isArray(symbolsOrOptions) ? symbolsOrOptions : symbolsOrOptions.symbols;
    const options = (Array.isArray(symbolsOrOptions) ? maybeOptions : symbolsOrOptions) as
      | RequestOptions
      | undefined;
    const payload = await this.api.get(
      { function: "REALTIME_BULK_BID_ASK_PRICES", symbol: symbols.join(",") },
      options,
    );
    const rows = findArrayValue(payload, "intradayprices");
    const data = rows.map((row) => {
      if (!isRecord(row)) {
        throw new ParseError(`alphavantage: bidAsk: expected object row, got ${describe(row)}`, {
          field: "Intraday Prices",
        });
      }
      return deepNormalize(row) as BidAskQuote;
    });
    return envelope(data, parseMeta(payload));
  }

  /** Top gainers, losers and most actively traded (US market). */
  async topMovers(options?: {
    entitlement?: Entitlement;
  }): Promise<MarketResponse<TopMovers, AlphaVantageMetaFields>> {
    const payload = await this.api.get(
      { function: "TOP_GAINERS_LOSERS", entitlement: options?.entitlement },
      options as RequestOptions,
    );
    const normalized = deepNormalize(payload) as Record<string, unknown>;
    const toMovers = (rows: unknown): Mover[] =>
      Array.isArray(rows)
        ? rows.map((row) => {
            const r = row as Record<string, unknown>;
            return {
              ticker: String(r.ticker ?? ""),
              price: Number(r.price ?? 0),
              changeAmount: Number(r.changeAmount ?? 0),
              changePercentage: Number(r.changePercentage ?? 0),
              volume: Number(r.volume ?? 0),
            };
          })
        : [];
    const data: TopMovers = {
      lastUpdated: typeof normalized.lastUpdated === "string" ? normalized.lastUpdated : undefined,
      topGainers: toMovers(normalized.topGainers),
      topLosers: toMovers(normalized.topLosers),
      mostActivelyTraded: Array.isArray(normalized.mostActivelyTraded)
        ? undefined
        : (((normalized.mostActivelyTraded as unknown as Record<string, unknown>) && {
            ticker: String((normalized.mostActivelyTraded as Record<string, unknown>).ticker ?? ""),
            price: Number((normalized.mostActivelyTraded as Record<string, unknown>).price ?? 0),
            changeAmount: Number(
              (normalized.mostActivelyTraded as Record<string, unknown>).changeAmount ?? 0,
            ),
            changePercentage: Number(
              (normalized.mostActivelyTraded as Record<string, unknown>).changePercentage ?? 0,
            ),
            volume: Number((normalized.mostActivelyTraded as Record<string, unknown>).volume ?? 0),
          }) as Mover | undefined),
    };
    return envelope(data, parseMeta(payload));
  }

  /** PRD §13: `MARKET_STATUS` (also exposed as `market.status()`). */
  async marketStatus(
    options?: RequestOptions,
  ): Promise<MarketResponse<MarketStatusDay[], AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "MARKET_STATUS" }, options);
    const rows = findArrayValue(payload, "markets");
    const data = rows.map((row) => {
      if (!isRecord(row)) {
        throw new ParseError(
          `alphavantage: marketStatus: expected object row, got ${describe(row)}`,
          {
            field: "markets",
          },
        );
      }
      return normalizeKeys(row) as unknown as MarketStatusDay;
    });
    return envelope(data, parseMeta(payload));
  }
}

/** Find the time-series section regardless of interval naming. */
function findSeriesSection(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload)) return undefined;
  for (const [key, value] of Object.entries(payload)) {
    if (key.toLowerCase().includes("time series") && isRecord(value)) return value;
  }
  return undefined;
}

function findArrayValue(payload: unknown, ...names: string[]): unknown[] {
  if (!isRecord(payload)) return [];
  for (const name of names) {
    for (const [key, value] of Object.entries(payload)) {
      if (normalizeKey(key).toLowerCase() === name && Array.isArray(value)) return value;
    }
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeKeys(
  record: Record<string, unknown>,
): Record<string, string | number | undefined> {
  const out: Record<string, string | number | undefined> = {};
  for (const [key, value] of Object.entries(record)) {
    out[normalizeKey(key)] =
      typeof value === "string" || typeof value === "number" ? numeric(value) : undefined;
  }
  return out;
}
