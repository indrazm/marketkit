/**
 * Remaining domains: options chains (`Ticker.options`), market search +
 * movers/screeners, and forex & crypto (same chart/quote tape as stocks —
 * Yahoo addresses them as `EURUSD=X` / `BTC-USD` symbols).
 */

import { NotFoundError, type MarketResponse, type RequestOptions } from "@marketkit/core";

import { chartMeta, envelope, parseChartCandles, type YahooApi } from "./api.js";
import { decodeQuote, historyParams } from "./stocks.js";
import { decodeArticle } from "./news.js";
import { isRecord, optionalDate, optionalNumber, optionalString } from "./shared.js";
import type {
  Candle,
  HistoryOptions,
  NewsArticle,
  OptionChain,
  OptionChainSlice,
  OptionContract,
  Quote,
  SearchHit,
  ScreenerRow,
  YahooMeta,
} from "./types.js";

function meta(): YahooMeta {
  return { provider: "yfinance", fetchedAt: new Date() };
}

function listOf(payload: unknown, key: string): unknown[] {
  const rows = isRecord(payload) ? payload[key] : undefined;
  return Array.isArray(rows) ? rows : [];
}

export class OptionsNamespace {
  constructor(private readonly api: YahooApi) {}

  /** Listed expiration dates (`Ticker.options`). */
  async expirations(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Date[], YahooMeta>> {
    const payload = await this.api.getQuery2<unknown>(
      `v7/finance/options/${encodeURIComponent(symbol)}`,
      {},
      options,
    );
    const chain = chainResult(payload, symbol);
    const dates = Array.isArray(chain.expirationDates)
      ? chain.expirationDates.filter((d): d is number => typeof d === "number")
      : [];
    return envelope(
      dates.map((d) => new Date(d * 1000)),
      meta(),
    );
  }

  /**
   * Full chain. Without `date`, Yahoo returns every listed expiration slice
   * (can be large); pass an epoch `date` from `expirations()` to narrow it.
   */
  async chain(
    symbol: string,
    options?: RequestOptions & { date?: number | Date },
  ): Promise<MarketResponse<OptionChain, YahooMeta>> {
    const date =
      options?.date instanceof Date ? Math.floor(options.date.getTime() / 1000) : options?.date;
    const payload = await this.api.getQuery2<unknown>(
      `v7/finance/options/${encodeURIComponent(symbol)}`,
      date !== undefined ? { date } : {},
      options,
    );
    const chain = chainResult(payload, symbol);
    const expirations = Array.isArray(chain.expirationDates)
      ? chain.expirationDates
          .filter((d): d is number => typeof d === "number")
          .map((d) => new Date(d * 1000))
      : [];
    const slices: OptionChainSlice[] = Array.isArray(chain.options)
      ? chain.options.filter(isRecord).map((slice) => ({
          expiration: optionalDate(slice.expirationDate) ?? new Date(0),
          calls: contractRows(slice.calls),
          puts: contractRows(slice.puts),
        }))
      : [];
    return envelope(
      { underlyingSymbol: String(chain.underlyingSymbol ?? symbol), expirations, slices },
      meta(),
    );
  }
}

function chainResult(payload: unknown, symbol: string): Record<string, unknown> {
  const chain = isRecord(payload) ? payload.optionChain : undefined;
  const results = isRecord(chain) ? chain.result : undefined;
  if (!Array.isArray(results) || results.length === 0 || !isRecord(results[0])) {
    throw new NotFoundError(`yfinance: options(${symbol}): no chain in response`, {
      provider: "yfinance",
    });
  }
  return results[0];
}

function contractRows(value: unknown): OptionContract[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((row) => ({
    contractSymbol: String(row.contractSymbol ?? ""),
    strike: optionalNumber(row.strike) ?? 0,
    currency: optionalString(row.currency),
    lastPrice: optionalNumber(row.lastPrice),
    change: optionalNumber(row.change),
    changePercent: optionalNumber(row.percentChange),
    volume: optionalNumber(row.volume),
    openInterest: optionalNumber(row.openInterest),
    bid: optionalNumber(row.bid),
    ask: optionalNumber(row.ask),
    impliedVolatility: optionalNumber(row.impliedVolatility),
    inTheMoney: typeof row.inTheMoney === "boolean" ? row.inTheMoney : undefined,
    expiration: optionalDate(row.expiration),
    lastTradeDate: optionalDate(row.lastTradeDate),
  }));
}

export class MarketNamespace {
  constructor(private readonly api: YahooApi) {}

  /** Symbol lookup (`q=`, quotes + news rails preserved verbatim). */
  async search(
    query: string,
    options?: RequestOptions & { quotesCount?: number; newsCount?: number },
  ): Promise<MarketResponse<{ hits: SearchHit[]; news: NewsArticle[] }, YahooMeta>> {
    const payload = await this.api.getQuery2<unknown>(
      "v1/finance/search",
      {
        q: query,
        quotesCount: options?.quotesCount ?? 10,
        newsCount: options?.newsCount ?? 5,
      },
      options,
    );
    const hits: SearchHit[] = listOf(payload, "quotes")
      .filter(isRecord)
      .map((row) => ({
        symbol: String(row.symbol ?? ""),
        name: optionalString(row.longname) ?? optionalString(row.shortname),
        exchange: optionalString(row.exchange ?? row.exchDisp),
        quoteType: optionalString(row.quoteType),
        typeDisplay: optionalString(row.typeDisp),
      }));
    const news = listOf(payload, "news").map(decodeArticle);
    return envelope({ hits, news }, meta());
  }

  /** Predefined movers universe (`day_gainers`, `day_losers`, `most_actives`). */
  async movers(
    universe: "day_gainers" | "day_losers" | "most_actives" | (string & {}),
    options?: RequestOptions & { count?: number; offset?: number },
  ): Promise<MarketResponse<ScreenerRow[], YahooMeta>> {
    return this.screener(universe, options);
  }

  /** Predefined saved screener by id (`small_cap_gainers`, `aggressive_small_caps`, ...). */
  async screener(
    scrId: string,
    options?: RequestOptions & { count?: number; offset?: number },
  ): Promise<MarketResponse<ScreenerRow[], YahooMeta>> {
    const payload = await this.api.getQuery1<unknown>(
      "v1/finance/screener/predefined/saved",
      {
        scrIds: scrId,
        count: options?.count ?? 25,
        start: options?.offset,
      },
      options,
    );
    const finance = isRecord(payload) ? payload.finance : undefined;
    const results = isRecord(finance) ? finance.result : undefined;
    const quotes =
      Array.isArray(results) && results.length > 0 && isRecord(results[0]) ? results[0].quotes : [];
    const rows = (Array.isArray(quotes) ? quotes : []).filter(isRecord).map((row) => ({
      symbol: String(row.symbol ?? ""),
      ...row,
    }));
    return envelope(rows, meta());
  }
}

export class ForexNamespace {
  constructor(private readonly api: YahooApi) {}

  /** FX history via the chart tape (`C:EURUSD`-style pairs are `EURUSD=X`). */
  async history(
    pair: string,
    options: HistoryOptions = {},
  ): Promise<MarketResponse<Candle[], YahooMeta>> {
    const { path, params } = historyParams(pair, options);
    const payload = await this.api.getQuery1<unknown>(path, params, options);
    return envelope(parseChartCandles(payload, `forex.history(${pair})`), {
      provider: "yfinance",
      fetchedAt: new Date(),
      ...chartMeta(payload),
    });
  }

  /** Latest FX quote via the v7 quote tape. */
  async quote(pair: string, options?: RequestOptions): Promise<MarketResponse<Quote, YahooMeta>> {
    const payload = await this.api.getQuery1<unknown>(
      "v7/finance/quote",
      { symbols: pair },
      options,
    );
    const response = isRecord(payload) ? payload.quoteResponse : undefined;
    const results = isRecord(response) && Array.isArray(response.result) ? response.result : [];
    return envelope(decodeQuote(results[0] ?? {}), meta());
  }
}

export class CryptoNamespace {
  constructor(private readonly api: YahooApi) {}

  /** Crypto history via the chart tape (`X:BTCUSD`-style pairs are `BTC-USD`). */
  async history(
    pair: string,
    options: HistoryOptions = {},
  ): Promise<MarketResponse<Candle[], YahooMeta>> {
    const { path, params } = historyParams(pair, options);
    const payload = await this.api.getQuery1<unknown>(path, params, options);
    return envelope(parseChartCandles(payload, `crypto.history(${pair})`), {
      provider: "yfinance",
      fetchedAt: new Date(),
      ...chartMeta(payload),
    });
  }

  /** Latest crypto quote via the v7 quote tape. */
  async quote(pair: string, options?: RequestOptions): Promise<MarketResponse<Quote, YahooMeta>> {
    const payload = await this.api.getQuery1<unknown>(
      "v7/finance/quote",
      { symbols: pair },
      options,
    );
    const response = isRecord(payload) ? payload.quoteResponse : undefined;
    const results = isRecord(response) && Array.isArray(response.result) ? response.result : [];
    return envelope(decodeQuote(results[0] ?? {}), meta());
  }
}
