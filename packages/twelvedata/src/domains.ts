/**
 * Remaining domains: options chains/prices, forex, crypto, commodities,
 * calendars, and reference/list endpoints. All follow the same envelope
 * pattern; loose payloads are returned with verbatim keys (TD's keys are
 * already clean) and numeric strings coerced.
 */

import { MarketResponse, ParseError, RequestOptions } from "@marketkit/core";

import { type TwelveDataApi } from "./api.js";
import type {
  Candle,
  CommodityName,
  EarningsCalendarOptions,
  ForexPair,
  ForexPairInput,
  Interval,
  OptionContract,
  OptionsChainOptions,
  RateQuote,
} from "./types.js";
import {
  envelope,
  normalizeRow,
  optionalString,
  parseCandles,
  parseMeta,
  parseTimestamp,
  strictNumber,
  type TwelveDataMetaFields,
} from "./normalize.js";

export function splitPair(pair: ForexPairInput): ForexPair {
  if (typeof pair === "string") {
    const [from, to] = pair.split("/");
    if (!from || !to) {
      throw new ParseError(`twelvedata: invalid pair ${JSON.stringify(pair)}; expected "EUR/USD"`, {
        field: "pair",
      });
    }
    return { from: from.trim(), to: to.trim() };
  }
  return pair;
}

/** `options/chain`, `options_prices`, `options/realtime`. */
export class OptionsNamespace {
  constructor(private readonly api: TwelveDataApi) {}

  /** Options chain (delayed). */
  async chain(
    options: OptionsChainOptions,
  ): Promise<MarketResponse<OptionContract[], TwelveDataMetaFields>> {
    const payload = await this.api.get(
      "options/chain",
      { symbol: options.symbol, exchange: options.exchange },
      options,
    );
    return envelope(readContracts(payload), parseMeta(payload, options.symbol));
  }

  /** Realtime options prices (premium). */
  async prices(
    options: OptionsChainOptions,
  ): Promise<MarketResponse<OptionContract[], TwelveDataMetaFields>> {
    const payload = await this.api.get(
      "options/realtime",
      { symbol: options.symbol, exchange: options.exchange },
      options,
    );
    return envelope(readContracts(payload), parseMeta(payload, options.symbol));
  }
}

function readContracts(payload: unknown): OptionContract[] {
  const rows =
    (payload as { data?: unknown; options?: unknown }).data ??
    (payload as { options?: unknown }).options;
  const list = Array.isArray(rows) ? rows : [];
  return list.map((row) => normalizeRow(row) as OptionContract);
}

export class ForexNamespace {
  constructor(private readonly api: TwelveDataApi) {}

  /** `exchange_rate` — live rate for a pair. */
  async rate(
    pair: ForexPairInput,
    options?: RequestOptions,
  ): Promise<MarketResponse<RateQuote, TwelveDataMetaFields>> {
    const { from, to } = splitPair(pair);
    const symbol = `${from}/${to}`;
    const payload = await this.api.get("exchange_rate", { symbol }, options);
    return envelope(
      {
        symbol: optionalString((payload as { symbol?: unknown }).symbol) ?? symbol,
        rate: strictNumber((payload as { rate?: unknown }).rate, "rate"),
        asOf: optionalString((payload as { datetime?: unknown }).datetime)
          ? parseTimestamp(String((payload as { datetime?: unknown }).datetime))
          : undefined,
      },
      parseMeta(payload, symbol),
    );
  }

  /** `forex_pairs/time_series` — FX history (no volume). */
  async history(
    pair: ForexPairInput,
    options: {
      interval: Interval;
      outputsize?: number | "compact";
      startDate?: string;
      endDate?: string;
    } & RequestOptions,
  ): Promise<MarketResponse<Candle[], TwelveDataMetaFields>> {
    const { from, to } = splitPair(pair);
    const payload = await this.api.get(
      "forex_pairs/time_series",
      {
        symbol: `${from}/${to}`,
        interval: options.interval,
        outputsize: options.outputsize,
        start_date: options.startDate,
        end_date: options.endDate,
      },
      options,
    );
    return envelope(parseCandles(payload, false), parseMeta(payload, `${from}/${to}`));
  }
}

export class CryptoNamespace {
  constructor(private readonly api: TwelveDataApi) {}

  /** `price` for a crypto pair, e.g. `BTC/USD` (optionally `exchange`). */
  async price(
    pair: ForexPairInput,
    options?: RequestOptions & { exchange?: string },
  ): Promise<MarketResponse<RateQuote, TwelveDataMetaFields>> {
    const { from, to } = splitPair(pair);
    const symbol = `${from}/${to}`;
    const payload = await this.api.get("price", { symbol, exchange: options?.exchange }, options);
    return envelope(
      {
        symbol,
        rate: strictNumber((payload as { price?: unknown }).price, "price"),
      },
      parseMeta(payload, symbol),
    );
  }

  /** Crypto history; `exchange` disambiguates venues. */
  async history(
    pair: ForexPairInput,
    options: {
      interval: Interval;
      exchange?: string;
      outputsize?: number | "compact";
      startDate?: string;
      endDate?: string;
    } & RequestOptions,
  ): Promise<MarketResponse<Candle[], TwelveDataMetaFields>> {
    const { from, to } = splitPair(pair);
    const symbol = `${from}/${to}`;
    const payload = await this.api.get(
      "time_series",
      {
        symbol,
        exchange: options.exchange,
        interval: options.interval,
        outputsize: options.outputsize,
        start_date: options.startDate,
        end_date: options.endDate,
      },
      options,
    );
    return envelope(parseCandles(payload, false), parseMeta(payload, symbol));
  }
}

const COMMODITY_NAMES: Record<CommodityName, string> = {
  wti: "WTI",
  brent: "BRENT",
  natural_gas: "NATURAL_GAS",
  heating_oil: "HO",
  gasoline: "RB",
  copper: "CP",
  aluminum: "ALU",
  zinc: "ZNC",
  nickel: "NIC",
  gold: "XAU",
  silver: "XAG",
  palladium: "XPD",
  platinum: "XPT",
};

/** `commodities` (list) and `price` for raw materials. */
export class CommoditiesNamespace {
  constructor(private readonly api: TwelveDataApi) {}

  /** Supported commodity symbols. */
  async list(
    options?: RequestOptions,
  ): Promise<MarketResponse<Record<string, string>, TwelveDataMetaFields>> {
    const payload = await this.api.get("commodities", {}, options);
    const data = (payload as { data?: Record<string, string> }).data ?? {};
    return envelope(data, parseMeta(payload));
  }

  /** Latest price for a commodity symbol (`WTI`, `XAU`, ...). */
  async price(
    name: CommodityName,
    options?: RequestOptions,
  ): Promise<MarketResponse<RateQuote, TwelveDataMetaFields>> {
    const symbol = COMMODITY_NAMES[name];
    const payload = await this.api.get("price", { symbol }, options);
    return envelope(
      { symbol, rate: strictNumber((payload as { price?: unknown }).price, "price") },
      parseMeta(payload, symbol),
    );
  }
}

/** Calendar endpoints: earnings, dividends, splits, IPO. */
export class CalendarNamespace {
  constructor(private readonly api: TwelveDataApi) {}

  earningsCalendar(options: EarningsCalendarOptions = {}) {
    return this.#calendar("earnings_calendar", options);
  }

  dividendsCalendar(options: EarningsCalendarOptions = {}) {
    return this.#calendar("dividends_calendar", options);
  }

  splitsCalendar(options: EarningsCalendarOptions = {}) {
    return this.#calendar("splits_calendar", options);
  }

  ipoCalendar(options: EarningsCalendarOptions = {}) {
    return this.#calendar("ipo_calendar", options);
  }

  async #calendar(
    endpoint: string,
    options: EarningsCalendarOptions,
  ): Promise<
    MarketResponse<Array<Record<string, string | number | undefined>>, TwelveDataMetaFields>
  > {
    const payload = await this.api.get(
      endpoint,
      { date: options.date, period: options.period, country: options.country },
      options,
    );
    const rows =
      (payload as { earnings?: unknown; dividends?: unknown; splits?: unknown; ipos?: unknown })
        .earnings ??
      (payload as { dividends?: unknown }).dividends ??
      (payload as { splits?: unknown }).splits ??
      (payload as { ipos?: unknown }).ipos ??
      (payload as { data?: unknown }).data;
    const list = Array.isArray(rows)
      ? rows.map((row) => normalizeRow(row) as Record<string, string | number | undefined>)
      : [];
    return envelope(list, { provider: "twelvedata", fetchedAt: new Date() });
  }
}

/** Reference/list endpoints covering every supported asset class. */
export class ReferenceNamespace {
  constructor(private readonly api: TwelveDataApi) {}

  async #list(
    endpoint: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<unknown[], TwelveDataMetaFields>> {
    const payload = await this.api.get<unknown>(endpoint, {}, options);
    const rows = Array.isArray(payload)
      ? payload
      : (((payload as { data?: unknown }).data as unknown[]) ??
        Object.values(payload as Record<string, unknown>).find((value): value is unknown[] =>
          Array.isArray(value),
        ) ??
        []);
    return envelope(rows, { provider: "twelvedata", fetchedAt: new Date() });
  }

  stocks(options?: RequestOptions) {
    return this.#list("stocks", options);
  }
  etfs(options?: RequestOptions) {
    return this.#list("etfs", options);
  }
  funds(options?: RequestOptions) {
    return this.#list("funds", options);
  }
  mutualFunds(options?: RequestOptions) {
    return this.#list("mutual_funds", options);
  }
  bonds(options?: RequestOptions) {
    return this.#list("bonds", options);
  }
  cryptocurrencies(options?: RequestOptions) {
    return this.#list("cryptocurrencies", options);
  }
  cryptoExchanges(options?: RequestOptions) {
    return this.#list("cryptocurrency_exchanges", options);
  }
  forexPairs(options?: RequestOptions) {
    return this.#list("forex_pairs", options);
  }
  exchanges(options?: RequestOptions) {
    return this.#list("exchanges", options);
  }
  countries(options?: RequestOptions) {
    return this.#list("countries", options);
  }
  instrumentTypes(options?: RequestOptions) {
    return this.#list("instrument_type", options);
  }
  crossListings(symbol: string, options?: RequestOptions) {
    return this.#list("cross_listings", { ...options, symbol } as RequestOptions);
  }
  earliestTimestamp(symbol: string, options?: RequestOptions) {
    return this.#list("earliest_timestamp", { ...options, symbol } as RequestOptions);
  }
  technicalIndicatorsList(options?: RequestOptions) {
    return this.#list("technical_indicators", options);
  }
}
