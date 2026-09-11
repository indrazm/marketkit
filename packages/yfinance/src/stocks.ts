/**
 * Stocks domain: chart history (`Ticker.history`), v7 quotes
 * (`Ticker.info` fast fields), spark sparklines, and corporate actions.
 */

import { NotFoundError, type MarketResponse, type RequestOptions } from "@marketkit/core";

import { chartMeta, envelope, parseChartActions, parseChartCandles, type YahooApi } from "./api.js";
import {
  isRecord,
  optionalDate,
  optionalNumber,
  optionalString,
  toEpochSeconds,
} from "./shared.js";
import type {
  Candle,
  CorporateActions,
  HistoryOptions,
  LooseData,
  Quote,
  YahooMeta,
} from "./types.js";

function meta(payload: unknown): YahooMeta {
  const { exchange, currency } = chartMeta(payload);
  return { provider: "yfinance", fetchedAt: new Date(), exchange, currency };
}

export function historyParams(
  symbol: string,
  options: HistoryOptions,
): {
  path: string;
  params: Record<string, string | number | boolean | undefined>;
} {
  const params: Record<string, string | number | boolean | undefined> = {
    interval: options.interval ?? "1d",
    prepost: options.prepost,
    events: options.events && options.events.length > 0 ? options.events.join(",") : undefined,
  };
  if (options.from !== undefined || options.to !== undefined) {
    if (options.from !== undefined) params.period1 = toEpochSeconds(options.from, "from");
    if (options.to !== undefined) params.period2 = toEpochSeconds(options.to, "to");
  } else {
    params.range = options.range ?? "1mo";
  }
  return { path: `v8/finance/chart/${encodeURIComponent(symbol)}`, params };
}

export function decodeQuote(row: unknown): Quote {
  const r = isRecord(row) ? row : {};
  const asOf = optionalDate(r.regularMarketTime) ?? optionalDate(r.postMarketTime) ?? undefined;
  return {
    symbol: String(r.symbol ?? ""),
    name:
      optionalString(r.longName) ?? optionalString(r.shortName) ?? optionalString(r.displayName),
    exchange: optionalString(r.fullExchangeName) ?? optionalString(r.exchange),
    currency: optionalString(r.currency),
    price: optionalNumber(r.regularMarketPrice),
    previousClose: optionalNumber(r.regularMarketPreviousClose),
    open: optionalNumber(r.regularMarketOpen),
    high: optionalNumber(r.regularMarketDayHigh),
    low: optionalNumber(r.regularMarketDayLow),
    change: optionalNumber(r.regularMarketChange),
    changePercent: optionalNumber(r.regularMarketChangePercent),
    volume: optionalNumber(r.regularMarketVolume),
    averageVolume:
      optionalNumber(r.averageDailyVolume3Month) ?? optionalNumber(r.averageDailyVolume10Day),
    marketCap: optionalNumber(r.marketCap),
    trailingPE: optionalNumber(r.trailingPE),
    forwardPE: optionalNumber(r.forwardPE),
    dividendYield: optionalNumber(r.dividendYield),
    fiftyTwoWeekHigh: optionalNumber(r.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: optionalNumber(r.fiftyTwoWeekLow),
    marketState: optionalString(r.marketState),
    quoteType: optionalString(r.quoteType),
    asOf,
  };
}

function quoteMeta(): YahooMeta {
  return { provider: "yfinance", fetchedAt: new Date() };
}

export class StocksNamespace {
  constructor(private readonly api: YahooApi) {}

  /** `v8/finance/chart/{symbol}` → newest-first candles with adj close. */
  async history(
    symbol: string,
    options: HistoryOptions = {},
  ): Promise<MarketResponse<Candle[], YahooMeta>> {
    const { path, params } = historyParams(symbol, options);
    const payload = await this.api.getQuery1<unknown>(path, params, options);
    return envelope(parseChartCandles(payload, `history(${symbol})`), meta(payload));
  }

  /** Chart `events` block → dividends/splits for the window. */
  async actions(
    symbol: string,
    options: HistoryOptions = {},
  ): Promise<MarketResponse<CorporateActions, YahooMeta>> {
    const { path, params } = historyParams(symbol, {
      ...options,
      events: ["div", "split"],
    });
    const payload = await this.api.getQuery1<unknown>(path, params, options);
    return envelope(parseChartActions(payload, `actions(${symbol})`), meta(payload));
  }

  /** `v7/finance/quote` for one symbol (fast info fields). */
  async quote(symbol: string, options?: RequestOptions): Promise<MarketResponse<Quote, YahooMeta>> {
    const payload = await this.api.getQuery1<unknown>(
      "v7/finance/quote",
      { symbols: symbol },
      options,
    );
    const rows = quoteRows(payload, `quote(${symbol})`);
    return envelope(decodeQuote(rows[0] ?? {}), quoteMeta());
  }

  /** `v7/finance/quote` batch (comma-joined symbols, order preserved). */
  async quotes(
    symbols: string[],
    options?: RequestOptions,
  ): Promise<MarketResponse<Quote[], YahooMeta>> {
    const payload = await this.api.getQuery1<unknown>(
      "v7/finance/quote",
      { symbols: symbols.join(",") },
      options,
    );
    return envelope(quoteRows(payload, "quotes").map(decodeQuote), quoteMeta());
  }

  /**
   * `v7/finance/spark` sparklines — lightweight close series per symbol
   * (`{symbol, closes, timestamps}`).
   */
  async spark(
    symbols: string[],
    options?: RequestOptions & { range?: string; interval?: string },
  ): Promise<MarketResponse<LooseData[], YahooMeta>> {
    const payload = await this.api.getQuery1<unknown>(
      "v7/finance/spark",
      {
        symbols: symbols.join(","),
        range: options?.range ?? "1d",
        interval: options?.interval ?? "5m",
      },
      options,
    );
    const spark = isRecord(payload) ? payload.spark : undefined;
    const rows = isRecord(spark) && Array.isArray(spark.result) ? spark.result : [];
    return envelope(
      rows.map((row) => {
        const r = isRecord(row) ? row : {};
        const closes = Array.isArray(r.close) ? r.close.filter((v) => typeof v === "number") : [];
        const timestamps = Array.isArray(r.timestamp)
          ? r.timestamp
              .filter((v) => typeof v === "number")
              .map((v) => new Date((v as number) * 1000))
          : [];
        return { symbol: String(r.symbol ?? ""), closes, timestamps } as LooseData;
      }),
      quoteMeta(),
    );
  }

  /** Generic passthrough for any other Yahoo REST path. */
  async get<T = LooseData>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: RequestOptions & { host?: "query1" | "query2" },
  ): Promise<MarketResponse<T, YahooMeta>> {
    const payload =
      options?.host === "query2"
        ? await this.api.getQuery2<unknown>(path, params, options)
        : await this.api.getQuery1<unknown>(path, params, options);
    return envelope(payload as T, quoteMeta());
  }
}

function quoteRows(payload: unknown, context: string): unknown[] {
  const response = isRecord(payload) ? payload.quoteResponse : undefined;
  const rows = isRecord(response) ? response.result : undefined;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new NotFoundError(`yfinance: ${context}: no quote in response`, {
      provider: "yfinance",
    });
  }
  return rows;
}
