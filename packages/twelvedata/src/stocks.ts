/**
 * Stocks domain: `quote`, `price`, `time_series` (one `history()`), batch
 * quotes, symbol search, market state, market movers, and the loose
 * convenience endpoints (`eod`, `previous_close`? no — `eod`, `last_change`).
 */

import { type MarketResponse, type RequestOptions } from "@marketkit/core";

import { type TwelveDataApi } from "./api.js";
import {
  type Candle,
  type HistoryOptions,
  type Instrument,
  type MarketStatusEntry,
  type Mover,
  type StockHistoryMeta,
  type StockQuote,
  type SymbolOptions,
  type TopMovers,
} from "./types.js";
import {
  assertSymbol,
  envelope,
  normalizeRow,
  optionalNumber,
  optionalString,
  parseCandles,
  parseMeta,
  strictNumber,
  type TwelveDataMetaFields,
} from "./normalize.js";

export class StocksNamespace {
  constructor(private readonly api: TwelveDataApi) {}

  /** `quote` — full quote for one symbol (batch comma-joined returns an array). */
  async quote(
    symbol: string,
    options?: SymbolOptions,
  ): Promise<MarketResponse<StockQuote, StockHistoryMeta>> {
    const payload = await this.api.get(
      "quote",
      {
        symbol: assertSymbol(symbol),
        exchange: options?.exchange,
        mic_code: options?.micCode,
        country: options?.country,
      },
      options,
    );
    const row = payload as Record<string, unknown>;
    const quote: StockQuote = {
      symbol: optionalString(row.symbol) ?? symbol,
      name: optionalString(row.name),
      exchange: optionalString(row.exchange),
      currency: optionalString(row.currency),
      price: strictNumber(row.close, "close"),
      open: strictNumber(row.open, "open"),
      high: strictNumber(row.high, "high"),
      low: strictNumber(row.low, "low"),
      close: strictNumber(row.close, "close"),
      previousClose: strictNumber(row.previous_close, "previous_close"),
      change: strictNumber(row.change, "change"),
      changePercent: strictNumber(row.percent_change, "percent_change"),
      volume: optionalNumber(row.volume),
      averageVolume: optionalNumber(row.average_volume),
      isMarketOpen: row.is_market_open === true || row.is_market_open === "true",
      fiftyTwoWeek: readFiftyTwoWeek(row.fifty_two_week),
      asOf: optionalString(row.datetime) ? new Date(row.datetime as string) : undefined,
    };
    return envelope(quote, {
      ...parseMeta(payload, symbol),
      exchange: optionalString(row.exchange),
      currency: optionalString(row.currency),
    });
  }

  /** `price` — latest price only. */
  async price(
    symbol: string,
    options?: SymbolOptions,
  ): Promise<MarketResponse<number, TwelveDataMetaFields>> {
    const payload = await this.api.get(
      "price",
      {
        symbol: assertSymbol(symbol),
        exchange: options?.exchange,
        mic_code: options?.micCode,
        country: options?.country,
      },
      options,
    );
    return envelope(
      strictNumber((payload as { price?: unknown }).price, "price"),
      parseMeta(payload, symbol),
    );
  }

  /** `last_change` — absolute change since previous close. */
  async lastChange(
    symbol: string,
    options?: SymbolOptions,
  ): Promise<MarketResponse<number, TwelveDataMetaFields>> {
    const payload = await this.api.get(
      "last_change",
      { symbol: assertSymbol(symbol), exchange: options?.exchange },
      options,
    );
    return envelope(
      strictNumber((payload as { change?: unknown }).change, "change"),
      parseMeta(payload, symbol),
    );
  }

  /** `time_series` — one history() across 1min…1month (PRD §9 pattern). */
  async history(
    symbol: string,
    options: HistoryOptions,
  ): Promise<MarketResponse<Candle[], StockHistoryMeta>> {
    const payload = await this.api.get(
      "time_series",
      {
        symbol: assertSymbol(symbol),
        interval: options.interval,
        exchange: options.exchange,
        mic_code: options.micCode,
        country: options.country,
        outputsize: options.outputsize,
        start_date: options.startDate,
        end_date: options.endDate,
        timezone: options.timezone,
        splits: options.splits,
        dividends: options.dividends,
        order: options.order,
      },
      options,
    );
    // FX/index series carry no volume — treat volume as optional unless the
    // response's meta indicates an equities symbol... provider leaves it out;
    // missing volumes parse as undefined either way.
    return envelope(parseCandles(payload, false), {
      ...parseMeta(payload, symbol),
      interval: options.interval,
    });
  }

  /** `eod` — end-of-day prices (works across asset classes). */
  async eod(
    symbol: string,
    options?: SymbolOptions,
  ): Promise<MarketResponse<Candle[], TwelveDataMetaFields>> {
    const payload = await this.api.get(
      "eod",
      { symbol: assertSymbol(symbol), exchange: options?.exchange, country: options?.country },
      options,
    );
    return envelope(parseCandles(payload, false), parseMeta(payload, symbol));
  }

  /** `symbol_search` — instrument lookup. */
  async search(
    query: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Instrument[], TwelveDataMetaFields>> {
    const payload = await this.api.get("symbol_search", { symbol: query }, options);
    const rows = (payload as { data?: unknown }).data;
    if (!Array.isArray(rows)) {
      return envelope([], parseMeta(payload));
    }
    const data = rows.map((row) => {
      const r = normalizeRow(row);
      return {
        symbol: String(r.symbol ?? ""),
        name: String(r.instrument_name ?? r.name ?? ""),
        exchange: optionalString(r.exchange),
        micCode: optionalString(r.mic_code),
        country: optionalString(r.country),
        currency: optionalString(r.currency),
        type: optionalString(r.instrument_type),
      } satisfies Instrument;
    });
    return envelope(data, parseMeta(payload));
  }

  /** `market_state` — open/closed status per market. */
  async marketState(
    options?: RequestOptions,
  ): Promise<MarketResponse<MarketStatusEntry[], TwelveDataMetaFields>> {
    const payload = await this.api.get("market_state", {}, options);
    const rows = (payload as { markets?: unknown }).markets;
    const data = Array.isArray(rows) ? rows.map(normalizeRow) : [];
    return envelope(data as MarketStatusEntry[], parseMeta(payload));
  }

  /** `market_movers` — top gainers & losers for an exchange. */
  async movers(
    options?: RequestOptions & { country?: string },
  ): Promise<MarketResponse<TopMovers, TwelveDataMetaFields>> {
    const payload = await this.api.get("market_movers", { country: options?.country }, options);
    const readMovers = (rows: unknown): Mover[] =>
      Array.isArray(rows)
        ? rows.map((row) => {
            const r = normalizeRow(row);
            return {
              symbol: String(r.symbol ?? ""),
              name: optionalString(r.name),
              exchange: optionalString(r.exchange),
              micCode: optionalString(r.mic_code),
              country: optionalString(r.country),
              currency: optionalString(r.currency),
              type: optionalString(r.instrument_type),
              close: strictNumber(r.close, "close"),
              change: optionalNumber(r.change),
              percentChange: optionalNumber(r.percent_change),
              volume: optionalNumber(r.volume),
            };
          })
        : [];
    const data: TopMovers = {
      lastUpdated: optionalString((payload as { last_updated?: unknown }).last_updated),
      topGainers: readMovers((payload as { top_gainers?: unknown }).top_gainers),
      topLosers: readMovers((payload as { top_losers?: unknown }).top_losers),
    };
    return envelope(data, parseMeta(payload));
  }
}

function readFiftyTwoWeek(value: unknown): StockQuote["fiftyTwoWeek"] {
  if (typeof value !== "object" || value === null) return undefined;
  const r = value as Record<string, unknown>;
  const range = optionalString(r.range);
  return {
    low: optionalNumber(r.low),
    high: optionalNumber(r.high),
    lowChange: optionalNumber(r.low_change),
    highChange: optionalNumber(r.high_change),
    lowChangePercent: optionalNumber(r.low_change_percent),
    highChangePercent: optionalNumber(r.high_change_percent),
    range,
  };
}
