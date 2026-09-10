/**
 * Remaining domains: forex, crypto, calendars, economy, ETFs & mutual funds,
 * institutional, bonds, index, technical indicators, scan, and misc
 * (airline price index, bank branches, countries, COVID-19, FDA calendar,
 * global filings).
 */

import { MarketResponse, ParseError, RequestOptions } from "@marketkit/core";

import { envelope, FinnhubApi, meta, parseCandleColumns, parseTimestamp } from "./api.js";
import type { Candle, ForexPairInput, IndicatorOptions, LooseData, RateRow } from "./types.js";
import { deepNumeric, optionalString } from "./shared.js";
import { RESOLUTION } from "./stocks.js";

type Meta = { provider: "finnhub"; fetchedAt: Date };

function toUnix(value: string | number): number {
  if (typeof value === "number") return value;
  return Math.floor(parseTimestamp(value).getTime() / 1000);
}

function pairSymbol(pair: ForexPairInput): string {
  if (typeof pair === "string") return pair.toUpperCase();
  return `${pair.from}/${pair.to}`.toUpperCase();
}

export class ForexNamespace {
  constructor(private readonly api: FinnhubApi) {}

  async exchanges(options?: RequestOptions): Promise<MarketResponse<string[], Meta>> {
    const payload = await this.api.get("forex/exchange", {}, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(rows as string[], meta());
  }

  async symbols(
    exchange: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("forex/symbol", { exchange }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(
      rows.map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }

  /** `/forex/rates?base=USD` — one base vs many quotes. */
  async rates(
    base = "USD",
    date?: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<RateRow, Meta>> {
    const payload = await this.api.get("forex/rates", { base, date }, options);
    const row = deepNumeric(payload) as Record<string, unknown>;
    return envelope(
      {
        base: optionalString(row.base) ?? base,
        rates: (row.quote as Record<string, number>) ?? {},
        asOf:
          typeof row.last_updated === "object" || row.last_updated === undefined
            ? new Date()
            : new Date(String(row.last_updated)),
      },
      meta(),
    );
  }

  /** `/forex/candle` (premium). */
  async history(
    pair: ForexPairInput,
    options: { resolution: string; from: string | number; to: string | number } & RequestOptions,
  ): Promise<MarketResponse<Candle[], Meta>> {
    const payload = await this.api.get(
      "forex/candle",
      {
        symbol: pairSymbol(pair),
        resolution: RESOLUTION[options.resolution] ?? options.resolution,
        from: toUnix(options.from),
        to: toUnix(options.to),
      },
      options,
    );
    return envelope(parseCandleColumns(payload, false), meta());
  }
}

export class CryptoNamespace {
  constructor(private readonly api: FinnhubApi) {}

  async exchanges(options?: RequestOptions): Promise<MarketResponse<string[], Meta>> {
    const payload = await this.api.get("crypto/exchange", {}, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(rows as string[], meta());
  }

  async symbols(
    exchange: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("crypto/symbol", { exchange }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(
      rows.map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }

  async profile(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get("crypto/profile", { symbol }, options);
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  /** `/crypto/candle` (premium). */
  async history(
    pair: ForexPairInput,
    options: {
      resolution: string;
      exchange?: string;
      from: string | number;
      to: string | number;
    } & RequestOptions,
  ): Promise<MarketResponse<Candle[], Meta>> {
    const payload = await this.api.get(
      "crypto/candle",
      {
        symbol: pairSymbol(pair),
        exchange: options.exchange,
        resolution: RESOLUTION[options.resolution] ?? options.resolution,
        from: toUnix(options.from),
        to: toUnix(options.to),
      },
      options,
    );
    return envelope(parseCandleColumns(payload, false), meta());
  }
}

export class CalendarNamespace {
  constructor(private readonly api: FinnhubApi) {}

  async earningsCalendar(
    options: { from?: string; to?: string; international?: boolean } & RequestOptions = {},
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get(
      "calendar/earnings",
      { from: options.from, to: options.to, international: options.international },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  async ipoCalendar(
    options: { from?: string; to?: string } & RequestOptions = {},
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get(
      "calendar/ipo",
      { from: options.from, to: options.to },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  async economicCalendar(options?: RequestOptions): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("calendar/economic", {}, options);
    const rows = Array.isArray(payload) ? payload : [];
    const rowList =
      rows.length > 0
        ? rows
        : ((payload as { economicCalendar?: unknown[] }).economicCalendar ?? []);
    return envelope(
      rowList.map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }
}

export class EconomyNamespace {
  constructor(private readonly api: FinnhubApi) {}

  /** `/economic` — all available economic codes. */
  async codes(options?: RequestOptions): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("economic", {}, options);
    const rows = Array.isArray(payload)
      ? payload
      : (((payload as { data?: unknown }).data as unknown[]) ?? []);
    return envelope(
      rows.map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }

  /** `/economic/code/<code>` — a single economic series. */
  async series(code: string, options?: RequestOptions): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get(`economic/code/${code}`, {}, options);
    return envelope(deepNumeric(payload) as LooseData, meta());
  }
}

export class IndicatorNamespace {
  constructor(private readonly api: FinnhubApi) {}

  /**
   * `/indicator` — TA-Lib style indicators (`rsi`, `macd`, `sma`, ...).
   * Returns the provider payload verbatim (column arrays) with numerics
   * coerced; the shape varies per indicator.
   */
  async get<T = LooseData>(
    indicator: string,
    options: IndicatorOptions,
  ): Promise<MarketResponse<T, Meta>> {
    const payload = await this.api.get(
      "indicator",
      {
        symbol: options.symbol,
        resolution: RESOLUTION[options.resolution] ?? options.resolution,
        from: toUnix(options.from),
        to: toUnix(options.to),
        indicator,
        timeperiod: options.period,
        ...options.params,
      },
      options,
    );
    return envelope(deepNumeric(payload) as T, meta());
  }
}

export class ScanNamespace {
  constructor(private readonly api: FinnhubApi) {}

  pattern(_options: { scanCriteria?: unknown } & RequestOptions = {}) {
    return this.#scan("scan/pattern");
  }

  supportResistance(options: { symbols?: string } & RequestOptions = {}) {
    return this.#scan("scan/support-resistance", { symbols: options.symbols });
  }

  technicalIndicator(options: { symbols?: string; countries?: string } & RequestOptions = {}) {
    return this.#scan("scan/technical-indicator", {
      symbols: options.symbols,
      countries: options.countries,
    });
  }

  async #scan(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get(endpoint, params, options);
    return envelope(deepNumeric(payload) as LooseData, meta());
  }
}

export class IndexNamespace {
  constructor(private readonly api: FinnhubApi) {}

  /** `/index/constituents` — e.g. `^GSPC`, `^NDX`. */
  async constituents(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get("index/constituents", { symbol }, options);
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  /** `/index/list` — supported global indices. */
  async list(options?: RequestOptions): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("index/list", {}, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(
      rows.map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }
}

/** ETF / mutual-fund endpoints, same parameter shapes. */
export class FundsNamespace {
  constructor(private readonly api: FinnhubApi) {}

  async etfProfile(symbol: string, options?: RequestOptions) {
    return this.#fund("etf/profile", { symbol }, options);
  }

  async etfHoldings(symbol: string, options?: RequestOptions) {
    return this.#fund("etf/holdings", { symbol, isin: undefined, sko: undefined }, options);
  }

  async etfAllocation(symbol: string, options?: RequestOptions) {
    return this.#fund("etf/allocation", { symbol }, options);
  }

  async etfSector(symbol: string, options?: RequestOptions) {
    return this.#fund("etf/sector", { symbol }, options);
  }

  async etfCountry(symbol: string, options?: RequestOptions) {
    return this.#fund("etf/country", { symbol }, options);
  }

  async etfList(options?: RequestOptions) {
    return this.#fund("etf/list", {}, options);
  }

  async mutualFundProfile(symbol: string, options?: RequestOptions) {
    return this.#fund("mutual-fund/profile", { symbol }, options);
  }

  async mutualFundHoldings(symbol: string, options?: RequestOptions) {
    return this.#fund("mutual-fund/holdings", { symbol }, options);
  }

  async mutualFundSector(symbol: string, options?: RequestOptions) {
    return this.#fund("mutual-fund/sector", { symbol }, options);
  }

  async mutualFundCountry(symbol: string, options?: RequestOptions) {
    return this.#fund("mutual-fund/country", { symbol }, options);
  }

  async mutualFundEet(symbol: string, options?: RequestOptions) {
    return this.#fund("mutual-fund/eet", { symbol }, options);
  }

  async mutualFundEetPai(symbol: string, options?: RequestOptions) {
    return this.#fund("mutual-fund/eet-pai", { symbol }, options);
  }

  async #fund<T = LooseData>(
    endpoint: string,
    params: Record<string, string | undefined>,
    options?: RequestOptions,
  ): Promise<MarketResponse<T, Meta>> {
    const payload = await this.api.get(endpoint, params, options);
    return envelope(deepNumeric(payload) as T, meta());
  }
}

/** Institutional ownership, bonds, misc datasets. */
export class DataNamespace {
  constructor(private readonly api: FinnhubApi) {}

  async institutionalProfile(cik: string, options?: RequestOptions) {
    return this.#get("institutional/profile", { cik }, options);
  }

  async institutionalPortfolio(cik: string, options?: RequestOptions) {
    return this.#get("institutional/portfolio", { cik }, options);
  }

  async institutionalOwnership(symbol: string, options?: RequestOptions) {
    return this.#get("institutional/ownership", { symbol }, options);
  }

  async bondProfile(isin: string, options?: RequestOptions) {
    return this.#get("bond/profile", { isin }, options);
  }

  async bondPrice(isin: string, options?: RequestOptions) {
    return this.#get("bond/price", { isin }, options);
  }

  async bondTick(isin: string, options?: RequestOptions) {
    return this.#get("bond/tick", { isin }, options);
  }

  async bondYieldCurve(usYieldCurve?: boolean, options?: RequestOptions) {
    return this.#get(
      "bond/yield-curve",
      { usYieldCurve: usYieldCurve ? "true" : undefined },
      options,
    );
  }

  async airlinePriceIndex(options?: RequestOptions) {
    return this.#get("airline/price-index", {}, options);
  }

  async bankBranches(options?: RequestOptions) {
    return this.#get("bank-branch", {}, options);
  }

  async countries(options?: RequestOptions) {
    return this.#get("country", {}, options);
  }

  async covid19(options?: RequestOptions) {
    return this.#get("covid19/us", {}, options);
  }

  async fdaCalendar(options?: RequestOptions) {
    return this.#get("fda-advisory-committee-calendar", {}, options);
  }

  async globalFilingsSearch(
    options: Record<string, string | number | boolean | undefined> & { q: string },
  ) {
    return this.#get("global-filings/search", options);
  }

  async usaSpending(symbol: string, options?: RequestOptions) {
    return this.#get("stock/usa-spending", { symbol }, options);
  }

  async usptoPatent(symbol: string, options?: RequestOptions) {
    return this.#get("stock/uspto-patent", { symbol }, options);
  }

  async visaApplication(symbol: string, options?: RequestOptions) {
    return this.#get("stock/visa-application", { symbol }, options);
  }

  async lobbying(symbol: string, options?: RequestOptions) {
    return this.#get("stock/lobbying", { symbol }, options);
  }

  async investmentTheme(theme: string, options?: RequestOptions) {
    return this.#get("stock/investment-theme", { theme }, options);
  }

  async supplyChain(symbol: string, options?: RequestOptions) {
    return this.#get("stock/supply-chain", { symbol }, options);
  }

  async revenueBreakdown(symbol: string, options?: RequestOptions) {
    return this.#get("stock/revenue-breakdown", { symbol }, options);
  }

  async newsroom(symbol: string, options?: RequestOptions) {
    return this.#get("stock/newsroom", { symbol }, options);
  }

  async historicalMarketCap(symbol: string, options?: RequestOptions) {
    return this.#get("stock/historical-market-cap", { symbol }, options);
  }

  async #get<T = LooseData>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined>,
    options?: RequestOptions,
  ): Promise<MarketResponse<T, Meta>> {
    const payload = await this.api.get(endpoint, params, options);
    return envelope(deepNumeric(payload) as T, meta());
  }
}

export function assertResolution(resolution: string): string {
  if (!RESOLUTION[resolution]) {
    throw new ParseError(`finnhub: unsupported resolution "${resolution}"`, {
      field: "resolution",
    });
  }
  return RESOLUTION[resolution] as string;
}
