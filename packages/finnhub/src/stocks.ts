/**
 * Stocks domain: quote, candles history, symbol lookup, market status/holiday,
 * peers, and the long tail of stock endpoints via typed passthroughs.
 */

import { type MarketResponse, type RequestOptions } from "@marketkit/core";

import { envelope, meta, parseCandleColumns, parseTimestamp, type FinnhubApi } from "./api.js";
import type {
  Candle,
  FinnhubMeta,
  HistoryOptions,
  Instrument,
  LooseData,
  MarketHoliday,
  MarketStatus,
  Resolution,
  StockHistoryMeta,
  StockQuote,
} from "./types.js";
import { deepNumeric, optionalString, strictNumber } from "./shared.js";

/** Docs intervals → provider resolution codes. */
export const RESOLUTION: Record<string, Resolution | string> = {
  "1min": "1",
  "5min": "5",
  "15min": "15",
  "30min": "30",
  "1h": "60",
  "1day": "D",
  "1week": "W",
  "1month": "M",
};

function toUnix(value: string | number): number {
  if (typeof value === "number") return value;
  return Math.floor(parseTimestamp(value).getTime() / 1000);
}

export class StocksNamespace {
  constructor(private readonly api: FinnhubApi) {}

  /** `/quote` — decoded from the provider's single-letter keys. */
  async quote(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<StockQuote, FinnhubMeta>> {
    const payload = await this.api.get("quote", { symbol }, options);
    const row = payload as Record<string, unknown>;
    return envelope(
      {
        symbol,
        price: strictNumber(row.c, "c (current price)"),
        change: strictNumber(row.d, "d (change)"),
        changePercent: strictNumber(row.dp, "dp (change %)"),
        high: strictNumber(row.h, "h (high)"),
        low: strictNumber(row.l, "l (low)"),
        open: strictNumber(row.o, "o (open)"),
        previousClose: strictNumber(row.pc, "pc (previous close)"),
        asOf: typeof row.t === "number" ? new Date(row.t * 1000) : new Date(),
      },
      meta(),
    );
  }

  /** `/stock/candle` — resolution + from/to mapped to provider codes. */
  async history(
    symbol: string,
    options: HistoryOptions,
  ): Promise<MarketResponse<Candle[], StockHistoryMeta>> {
    const resolution = RESOLUTION[options.resolution ?? "1day"] ?? "D";
    const payload = await this.api.get(
      "stock/candle",
      {
        symbol,
        resolution,
        from: toUnix(options.from),
        to: toUnix(options.to),
        adjusted: options.adjusted === true ? "true" : undefined,
      },
      options,
    );
    return envelope(
      parseCandleColumns(payload, false),
      meta({
        symbol,
        resolution: options.resolution,
      }),
    );
  }

  /** `/search` — symbol lookup. */
  async search(
    query: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Instrument[], FinnhubMeta>> {
    const payload = await this.api.get("search", { q: query }, options);
    const rows = (payload as { result?: unknown }).result;
    const data = Array.isArray(rows)
      ? rows.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            symbol: String(r.symbol ?? ""),
            name: String(r.description ?? ""),
            type: optionalString(r.type),
            region: optionalString(r.displaySymbol),
          } satisfies Instrument;
        })
      : [];
    return envelope(data, meta());
  }

  /** `/stock/symbol` — full symbol list for an exchange. */
  async symbols(
    exchange: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Instrument[], FinnhubMeta>> {
    const payload = await this.api.get("stock/symbol", { exchange }, options);
    const rows = Array.isArray(payload) ? payload : [];
    const data = rows.map((row) => {
      const r = deepNumeric(row) as Record<string, unknown>;
      return {
        symbol: String(r.symbol ?? ""),
        name: optionalString(r.description) ?? "",
        type: optionalString(r.type),
        currency: optionalString(r.currency),
        exchange: optionalString(r.exchange),
        micCode: optionalString(r.mic),
        figi: optionalString(r.figi),
        cik: optionalString(r.cik),
      } satisfies Instrument;
    });
    return envelope(data, meta());
  }

  /** `/stock/market-status`. */
  async marketStatus(
    exchange: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<MarketStatus, FinnhubMeta>> {
    const payload = await this.api.get("stock/market-status", { exchange }, options);
    const row = payload as Record<string, unknown>;
    return envelope(
      {
        exchange: optionalString(row.exchange),
        holiday: optionalString(row.holiday),
        timezone: optionalString(row.timezone),
        isOpen: row.isOpen === true,
        session: optionalString(row.session),
      },
      meta(),
    );
  }

  /** `/stock/market-holiday`. */
  async marketHoliday(
    exchange: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<MarketHoliday[], FinnhubMeta>> {
    const payload = await this.api.get("stock/market-holiday", { exchange }, options);
    const rows = (payload as { data?: unknown }).data;
    const data = Array.isArray(rows)
      ? rows.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            exchange: String(r.exchange ?? exchange),
            name: String(r.eventName ?? ""),
            date: String(r.date ?? ""),
            type: String(r.type ?? ""),
          } satisfies MarketHoliday;
        })
      : [];
    return envelope(data, meta());
  }

  /** `/stock/peers`. */
  async peers(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<string[], FinnhubMeta>> {
    const payload = await this.api.get("stock/peers", { symbol }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(rows as string[], meta());
  }

  /** `/stock/dividend` — dividend history between dates. */
  async dividends(
    symbol: string,
    options: { from: string; to: string } & RequestOptions,
  ): Promise<
    MarketResponse<
      Array<{
        symbol: string;
        amount: number;
        date: Date;
        recordDate?: Date;
        declarationDate?: Date;
        paymentDate?: Date;
      }>,
      FinnhubMeta
    >
  > {
    const payload = await this.api.get(
      "stock/dividend",
      { symbol, from: options.from, to: options.to },
      options,
    );
    const rows = Array.isArray(payload) ? payload : [];
    const data = rows.map((row) => {
      const r = deepNumeric(row) as Record<string, unknown>;
      return {
        symbol: String(r.symbol ?? symbol),
        amount: strictNumber(r.amount, "amount"),
        date: parseTimestamp(String(r.date ?? "")),
        recordDate:
          r.recordDate !== undefined && r.recordDate !== null
            ? parseTimestamp(String(r.recordDate))
            : undefined,
        declarationDate:
          r.declarationDate !== undefined && r.declarationDate !== null
            ? parseTimestamp(String(r.declarationDate))
            : undefined,
        paymentDate:
          r.paymentDate !== undefined && r.paymentDate !== null
            ? parseTimestamp(String(r.paymentDate))
            : undefined,
      };
    });
    return envelope(data, meta());
  }

  /** `/stock/split` — split history between dates. */
  async splits(
    symbol: string,
    options: { from: string; to: string } & RequestOptions,
  ): Promise<
    MarketResponse<
      Array<{ symbol: string; date: Date; fromFactor: number; toFactor: number }>,
      FinnhubMeta
    >
  > {
    const payload = await this.api.get(
      "stock/split",
      { symbol, from: options.from, to: options.to },
      options,
    );
    const rows = Array.isArray(payload) ? payload : [];
    const data = rows.map((row) => {
      const r = deepNumeric(row) as Record<string, unknown>;
      return {
        symbol: String(r.symbol ?? symbol),
        date: parseTimestamp(String(r.date ?? "")),
        fromFactor: strictNumber(r.fromFactor, "fromFactor"),
        toFactor: strictNumber(r.toFactor, "toFactor"),
      };
    });
    return envelope(data, meta());
  }

  /** Any other `/stock/*` endpoint, e.g. `stocks.get("metric", {symbol, metric: "all"})`. */
  async get<T = LooseData>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: RequestOptions,
  ): Promise<MarketResponse<T, FinnhubMeta>> {
    const payload = await this.api.get(
      `stock/${endpoint.replace(/^stock\//, "")}`,
      params,
      options,
    );
    return envelope(deepNumeric(payload) as T, meta());
  }
}
