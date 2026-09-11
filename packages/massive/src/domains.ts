/**
 * Remaining domains: ticker reference, market status/holidays, options chain
 * snapshots, forex & crypto (aggs + last trade), indices, technical
 * indicators (RSI/EMA/SMA/MACD), and economy.
 */

import { MarketResponse, RequestOptions } from "@marketkit/core";

import { envelope, MassiveApi, parseAggBars, type AggBar } from "./api.js";
import type {
  AggsMeta,
  AggsOptions,
  Instrument,
  LooseData,
  MarketStatus,
  OptionContractSnapshot,
} from "./types.js";
import { deepNumeric, optionalString } from "./shared.js";

type Meta = {
  provider: "massive";
  fetchedAt: Date;
  requestId?: string;
  status?: string;
  count?: number;
  nextUrl?: string;
};

function meta(payload: unknown): Meta {
  const record = (payload ?? {}) as Record<string, unknown>;
  return {
    provider: "massive",
    fetchedAt: new Date(),
    requestId: typeof record.request_id === "string" ? record.request_id : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    count: typeof record.count === "number" ? record.count : undefined,
    nextUrl: typeof record.next_url === "string" ? record.next_url : undefined,
  };
}

function isTickerObject(payload: unknown): boolean {
  return (
    deepNumeric(payload) !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "ticker" in (payload as Record<string, unknown>)
  );
}

function resultsOf(payload: unknown): unknown[] {
  const rows = (payload as { results?: unknown }).results;
  return Array.isArray(rows) ? rows : [];
}

function mapInstruments(payload: unknown): Instrument[] {
  return resultsOf(payload).map((row) => {
    const r = deepNumeric(row) as Record<string, unknown>;
    return {
      ticker: String(r.ticker ?? ""),
      name: optionalString(r.name),
      type: optionalString(r.type),
      market: optionalString(r.market),
      locale: optionalString(r.locale),
      currency: optionalString(r.currency_name ?? r.currency),
      exchange: optionalString(r.primary_exchange),
      active: r.active === true,
      primaryListing: optionalString(r.primary_listing),
      cik: optionalString(r.cik),
      figi: optionalString(r.figi),
    } satisfies Instrument;
  });
}

export class ReferenceNamespace {
  constructor(private readonly api: MassiveApi) {}

  /** `/v3/reference/tickers` — search/list all supported tickers. */
  async tickers(
    options: {
      search?: string;
      ticker?: string;
      market?: string;
      type?: string;
      active?: boolean;
      limit?: number;
    } & RequestOptions = {},
  ): Promise<MarketResponse<Instrument[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      "v3/reference/tickers",
      {
        search: options.search,
        ticker: options.ticker,
        market: options.market,
        type: options.type,
        active: options.active,
        limit: options.limit,
      },
      options,
    );
    return envelope(mapInstruments(payload), meta(payload));
  }

  /** `/v3/reference/tickers/{ticker}` — full ticker detail (object payload). */
  async ticker(
    ticker: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Instrument, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v3/reference/tickers/${encodeURIComponent(ticker)}`,
      {},
      options,
    );
    const instruments = mapInstruments({
      results: [
        isTickerObject(payload) ? payload : ((payload as { results?: unknown }).results ?? {}),
      ],
    });
    return envelope(instruments[0], meta(payload));
  }

  /** `/v3/reference/tickers/types`. */
  async tickerTypes(options?: RequestOptions): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const payload = await this.api.get<unknown>("v3/reference/tickers/types", {}, options);
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v3/reference/exchanges`. */
  async exchanges(options?: RequestOptions): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const payload = await this.api.get<unknown>("v3/reference/exchanges", {}, options);
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }
}

export class MarketNamespace {
  constructor(private readonly api: MassiveApi) {}

  /** `/v1/marketstatus/now`. */
  async status(options?: RequestOptions): Promise<MarketResponse<MarketStatus, AggsMeta>> {
    const payload = await this.api.get<unknown>("v1/marketstatus/now", {}, options);
    return envelope(deepNumeric(payload) as MarketStatus, meta(payload));
  }

  /** `/v1/marketstatus/upcoming`. */
  async upcoming(options?: RequestOptions): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const payload = await this.api.get<unknown>("v1/marketstatus/upcoming", {}, options);
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v1/marketdays/upcoming`. */
  async tradingDays(options?: RequestOptions): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const payload = await this.api.get<unknown>("v1/marketdays/upcoming", {}, options);
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }
}

export class OptionsNamespace {
  constructor(private readonly api: MassiveApi) {}

  /** `/v3/snapshot/options/{underlyingAsset}` — full option chain snapshot. */
  async chainSnapshot(
    underlying: string,
    options?: RequestOptions & { limit?: number; strike_price?: number; expiration_date?: string },
  ): Promise<MarketResponse<OptionContractSnapshot, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v3/snapshot/options/${encodeURIComponent(underlying)}`,
      {
        limit: options?.limit,
        strike_price: options?.strike_price,
        expiration_date: options?.expiration_date,
      },
      options,
    );
    return envelope(deepNumeric(payload) as OptionContractSnapshot, meta(payload));
  }

  /** `/v3/snapshot/options/{underlying}/{contract}` — single contract. */
  async contractSnapshot(
    underlying: string,
    contract: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<OptionContractSnapshot, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v3/snapshot/options/${encodeURIComponent(underlying)}/${encodeURIComponent(contract)}`,
      {},
      options,
    );
    return envelope(deepNumeric(payload) as OptionContractSnapshot, meta(payload));
  }

  /** Options aggregates (same shape as stock aggs). */
  async aggs(contract: string, options: AggsOptions): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(contract)}/range/${options.multiplier}/${options.timespan}/${encodeURIComponent(String(options.from))}/${encodeURIComponent(String(options.to))}`,
      { adjusted: options.adjusted, sort: options.sort, limit: options.limit },
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }

  /** `/v2/aggs/ticker/{contract}/prev`. */
  async previousClose(
    contract: string,
    options?: RequestOptions & { adjusted?: boolean },
  ): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(contract)}/prev`,
      { adjusted: options?.adjusted },
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }

  /** `/v1/open-close/{contract}/{date}` — daily contract summary. */
  async dailyOpenClose(
    contract: string,
    date: string,
    options?: RequestOptions & { adjusted?: boolean },
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v1/open-close/${encodeURIComponent(contract)}/${encodeURIComponent(date)}`,
      { adjusted: options?.adjusted },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v3/reference/options/contracts` — contract index. */
  async contracts(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(
      "v3/reference/options/contracts",
      params,
      signal ? { signal } : undefined,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v3/reference/options/contracts/{contract}` — contract overview. */
  async contract(
    contract: string,
    options?: RequestOptions & { as_of?: string },
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v3/reference/options/contracts/${encodeURIComponent(contract)}`,
      { as_of: options?.as_of },
      options,
    );
    const results = (payload as { results?: unknown }).results;
    return envelope(
      deepNumeric(results !== undefined ? results : payload) as LooseData,
      meta(payload),
    );
  }

  private async ticks(
    kind: "trades" | "quotes",
    contract: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(
      `v3/${kind}/${encodeURIComponent(contract)}`,
      params,
      signal ? { signal } : undefined,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v3/trades/{contract}` — option tick trades. */
  async trades(
    contract: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.ticks("trades", contract, options);
  }

  /** `/v3/quotes/{contract}` — option quote history. */
  async quotes(
    contract: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.ticks("quotes", contract, options);
  }

  /** `/v2/last/trade/{contract}` — latest option trade. */
  async lastTrade(
    contract: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/last/trade/${encodeURIComponent(contract)}`,
      {},
      options,
    );
    return envelope(
      deepNumeric((payload as { results?: unknown })?.results ?? {}) as LooseData,
      meta(payload),
    );
  }
}

export class ForexNamespace {
  constructor(private readonly api: MassiveApi) {}

  /** FX aggregates, e.g. ticker `C:EURUSD`. */
  async history(pair: string, options: AggsOptions): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(pair.toUpperCase())}/range/${options.multiplier}/${options.timespan}/${encodeURIComponent(String(options.from))}/${encodeURIComponent(String(options.to))}`,
      { adjusted: options.adjusted, sort: options.sort, limit: options.limit },
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }

  /** `/v2/snapshot/locale/global/markets/forex/tickers/{pair}`. */
  async snapshot(
    pair: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/snapshot/locale/global/markets/forex/tickers/${encodeURIComponent(pair.toUpperCase())}`,
      {},
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v2/snapshot/locale/global/markets/forex` — full FX snapshot. */
  async fullMarketSnapshot(options?: RequestOptions): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      "v2/snapshot/locale/global/markets/forex",
      {},
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** FX gainers/losers via `direction`. */
  async movers(
    direction: "gainers" | "losers",
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      "v2/snapshot/locale/global/markets/forex/direction",
      { direction },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v1/conversion/{from}/{to}` — real-time currency conversion. */
  async conversion(
    from: string,
    to: string,
    options?: RequestOptions & { amount?: number; precision?: number },
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v1/conversion/${encodeURIComponent(from.toUpperCase())}/${encodeURIComponent(to.toUpperCase())}`,
      { amount: options?.amount, precision: options?.precision },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v1/last_quote/currencies/{from}/{to}` — latest FX quote. */
  async lastQuote(
    from: string,
    to: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v1/last_quote/currencies/${encodeURIComponent(from.toUpperCase())}/${encodeURIComponent(to.toUpperCase())}`,
      {},
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v3/quotes/{pair}` — historical FX quotes. */
  async quotes(
    pair: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(
      `v3/quotes/${encodeURIComponent(pair.toUpperCase())}`,
      params,
      signal ? { signal } : undefined,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v2/aggs/ticker/{pair}/prev` — previous-day FX bar. */
  async previousClose(
    pair: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(pair.toUpperCase())}/prev`,
      {},
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }
}

export class CryptoNamespace {
  constructor(private readonly api: MassiveApi) {}

  /** Crypto aggregates, e.g. ticker `X:BTCUSD`. */
  async history(pair: string, options: AggsOptions): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(pair.toUpperCase())}/range/${options.multiplier}/${options.timespan}/${encodeURIComponent(String(options.from))}/${encodeURIComponent(String(options.to))}`,
      { adjusted: options.adjusted, sort: options.sort, limit: options.limit },
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }

  /** `/v1/last/crypto/{from}/{to}` — last trade for a pair. */
  async lastTrade(
    from: string,
    to: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v1/last/crypto/${encodeURIComponent(from.toUpperCase())}/${encodeURIComponent(to.toUpperCase())}`,
      {},
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** Crypto full market snapshot. */
  async fullMarketSnapshot(options?: RequestOptions): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      "v2/snapshot/locale/global/markets/crypto",
      {},
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v2/snapshot/locale/global/markets/crypto/tickers/{pair}`. */
  async snapshot(
    pair: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/snapshot/locale/global/markets/crypto/tickers/${encodeURIComponent(pair.toUpperCase())}`,
      {},
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** Crypto gainers/losers via `direction`. */
  async movers(
    direction: "gainers" | "losers",
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      "v2/snapshot/locale/global/markets/crypto/direction",
      { direction },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v3/trades/{pair}` — crypto tick trades. */
  async trades(
    pair: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(
      `v3/trades/${encodeURIComponent(pair.toUpperCase())}`,
      params,
      signal ? { signal } : undefined,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v2/aggs/ticker/{pair}/prev` — previous-day crypto bar. */
  async previousClose(
    pair: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(pair.toUpperCase())}/prev`,
      {},
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }
}

export class IndicesNamespace {
  constructor(private readonly api: MassiveApi) {}

  /** Index aggregates, e.g. ticker `I:SPX`. */
  async history(ticker: string, options: AggsOptions): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(ticker.toUpperCase())}/range/${options.multiplier}/${options.timespan}/${encodeURIComponent(String(options.from))}/${encodeURIComponent(String(options.to))}`,
      { sort: options.sort, limit: options.limit },
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }

  /** `/v2/aggs/ticker/{indicesTicker}/prev`. */
  async previousClose(
    ticker: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(ticker.toUpperCase())}/prev`,
      {},
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }

  /** `/v1/indices/{symbol}/constituents`? — not offered; day values via aggs. */

  /** `/v2/snapshot/locale/us/markets/indices` — indices snapshot. */
  async snapshot(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(
      "v2/snapshot/locale/us/markets/indices",
      params,
      signal ? { signal } : undefined,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v1/open-close/indices/{ticker}/{date}` — daily index summary. */
  async dailyOpenClose(
    ticker: string,
    date: string,
    options?: RequestOptions & { adjusted?: boolean },
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v1/open-close/${encodeURIComponent(ticker.toUpperCase())}/${encodeURIComponent(date)}`,
      { adjusted: options?.adjusted },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }
}

export class IndicatorsNamespace {
  constructor(private readonly api: MassiveApi) {}

  /** `/v1/indicators/{symbol}/{indicator}` — rsi, sma, ema, macd. */
  async get<T = LooseData>(
    indicator: "rsi" | "sma" | "ema" | "macd" | (string & {}),
    symbol: string,
    options: {
      timespan?: AggsOptions["timespan"];
      multiplier?: number;
      from?: string;
      to?: string;
      period?: number;
    } & RequestOptions = {},
  ): Promise<MarketResponse<T, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v1/indicators/${encodeURIComponent(symbol)}/${indicator.toLowerCase()}`,
      {
        timespan: options.timespan ?? "day",
        multiplier: options.multiplier ?? 1,
        from: options.from,
        to: options.to,
        time_period: options.period,
      },
      options,
    );
    return envelope(deepNumeric(payload) as T, meta(payload));
  }

  rsi(symbol: string, options?: Parameters<IndicatorsNamespace["get"]>[2]) {
    return this.get("rsi", symbol, options);
  }

  sma(symbol: string, options?: Parameters<IndicatorsNamespace["get"]>[2]) {
    return this.get("sma", symbol, options);
  }

  ema(symbol: string, options?: Parameters<IndicatorsNamespace["get"]>[2]) {
    return this.get("ema", symbol, options);
  }

  macd(symbol: string, options?: Parameters<IndicatorsNamespace["get"]>[2]) {
    return this.get("macd", symbol, options);
  }
}

export class EconomyNamespace {
  constructor(private readonly api: MassiveApi) {}

  /** Economy endpoints (treasury yields, inflation, labor market, ...). */
  async get<T = LooseData>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: RequestOptions,
  ): Promise<MarketResponse<T, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v1/economy/${path.replace(/^v1\/economy\//, "")}`,
      params,
      options,
    );
    return envelope(deepNumeric(payload) as T, meta(payload));
  }

  private list(
    path: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    return this.get<LooseData[]>(path, params, signal ? { signal } : undefined).then((res) => {
      const rows = Array.isArray(res.data)
        ? res.data
        : (((res.data as unknown as { results?: unknown }).results ?? []) as LooseData[]);
      return envelope(rows, res.meta);
    });
  }

  /** `GET /v1/economy/treasury-yields`. */
  async treasuryYields(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("treasury-yields", options);
  }

  /** `GET /v1/economy/inflation`. */
  async inflation(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("inflation", options);
  }

  /** `GET /v1/economy/inflation-expectations`. */
  async inflationExpectations(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("inflation-expectations", options);
  }

  /** `GET /v1/economy/labor-market`. */
  async laborMarket(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("labor-market", options);
  }

  /** `GET /v1/economy/funding-conditions`. */
  async fundingConditions(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("funding-conditions", options);
  }
}

export class FuturesNamespace {
  constructor(private readonly api: MassiveApi) {}

  private list(
    path: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    return this.api.get<unknown>(path, params, signal ? { signal } : undefined).then((payload) =>
      envelope(
        (((payload as { results?: unknown }).results as unknown[] | undefined) ?? []).map(
          (row) => deepNumeric(row) as LooseData,
        ),
        meta(payload),
      ),
    );
  }

  /** `GET /futures/v1/contracts` — contract index/specs. */
  async contracts(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("futures/v1/contracts", options);
  }

  /** `GET /futures/v1/products` — product universe/specs. */
  async products(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("futures/v1/products", options);
  }

  /** `GET /futures/v1/schedules` — trading schedules/sessions. */
  async schedules(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("futures/v1/schedules", options);
  }

  /** `GET /futures/v1/snapshot` — real-time contract snapshots. */
  async snapshot(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("futures/v1/snapshot", options);
  }

  /** Futures aggregates via the shared aggs tape. */
  async aggs(ticker: string, options: AggsOptions): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${options.multiplier}/${options.timespan}/${encodeURIComponent(String(options.from))}/${encodeURIComponent(String(options.to))}`,
      { sort: options.sort, limit: options.limit },
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }

  /** `GET /futures/v1/quotes/{ticker}` — futures quote history. */
  async quotes(
    ticker: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list(`futures/v1/quotes/${encodeURIComponent(ticker)}`, options);
  }

  /** `GET /futures/v1/trades/{ticker}` — futures tick trades. */
  async trades(
    ticker: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list(`futures/v1/trades/${encodeURIComponent(ticker)}`, options);
  }
}

export class PartnersNamespace {
  constructor(private readonly api: MassiveApi) {}

  private list(
    path: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    return this.api.get<unknown>(path, params, signal ? { signal } : undefined).then((payload) =>
      envelope(
        (((payload as { results?: unknown }).results as unknown[] | undefined) ?? []).map(
          (row) => deepNumeric(row) as LooseData,
        ),
        meta(payload),
      ),
    );
  }

  /** Benzinga passthrough (`news`, `earnings`, `analyst-ratings`, ...). */
  async benzinga(
    path: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list(`v1/benzinga/${path.replace(/^v1\/benzinga\//, "")}`, options);
  }

  /** `GET /v1/benzinga/news` — real-time Benzinga news. */
  async benzingaNews(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.benzinga("news", options);
  }

  /** `GET /v1/benzinga/earnings` — earnings announcements. */
  async benzingaEarnings(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.benzinga("earnings", options);
  }

  /** `GET /v1/benzinga/analyst-ratings` — analyst ratings. */
  async benzingaRatings(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.benzinga("analyst-ratings", options);
  }

  /** ETF Global passthrough (`analytics`, `constituents`, `fundflows`, ...). */
  async etfGlobal(
    path: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list(`v1/etf-global/${path.replace(/^v1\/etf-global\//, "")}`, options);
  }

  /** TMX / Wall Street Horizon corporate events. */
  async corporateEvents(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("v1/tmx/corporate-events", options);
  }
}

export class AlternativeNamespace {
  constructor(private readonly api: MassiveApi) {}

  private list(
    path: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    return this.api.get<unknown>(path, params, signal ? { signal } : undefined).then((payload) =>
      envelope(
        (((payload as { results?: unknown }).results as unknown[] | undefined) ?? []).map(
          (row) => deepNumeric(row) as LooseData,
        ),
        meta(payload),
      ),
    );
  }

  /** Fable merchant spending aggregates. */
  async merchantAggregates(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("v1/alternative/merchant-aggregates", options);
  }

  /** Fable merchant hierarchy reference. */
  async merchantHierarchy(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.list("v1/alternative/merchant-hierarchy", options);
  }
}
