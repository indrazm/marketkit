/**
 * Stocks domain: aggregates (custom bars, previous close, grouped daily),
 * snapshots (full market, single ticker, movers), last trade/quote,
 * corporate actions (dividends, splits), ticker reference, and news.
 */

import { MarketResponse, RequestOptions } from "@marketkit/core";

import { envelope, MassiveApi, parseAggBars, type AggBar } from "./api.js";
import type { AggsMeta, AggsOptions, LooseData, NewsArticle } from "./types.js";
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

function resultsOf(payload: unknown): unknown[] {
  const rows = (payload as { results?: unknown }).results;
  return Array.isArray(rows) ? rows : [];
}

export class StocksNamespace {
  constructor(private readonly api: MassiveApi) {}

  /** `/v2/aggs/ticker/{ticker}/range/{multiplier}/{timespan}/{from}/{to}`. */
  async aggs(ticker: string, options: AggsOptions): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${options.multiplier}/${options.timespan}/${encodeURIComponent(String(options.from))}/${encodeURIComponent(String(options.to))}`,
      { adjusted: options.adjusted, sort: options.sort, limit: options.limit },
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }

  /** `/v2/aggs/ticker/{ticker}/prev`. */
  async previousClose(
    ticker: string,
    options?: RequestOptions & { adjusted?: boolean },
  ): Promise<MarketResponse<AggBar[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`,
      { adjusted: options?.adjusted },
      options,
    );
    return envelope(parseAggBars(payload), meta(payload));
  }

  /** `/v2/aggs/grouped/{locale}/{market}/{date}` — all tickers for a day. */
  async groupedDaily(
    locale: "us" | "global",
    market: "stocks" | "options" | "crypto" | "fx",
    date: string,
    options?: RequestOptions & { adjusted?: boolean },
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/aggs/grouped/${locale}/${market}/${date}`,
      { adjusted: options?.adjusted },
      options,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v2/snapshot/locale/us/markets/stocks` — full market snapshot. */
  async fullMarketSnapshot(options?: RequestOptions): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      "v2/snapshot/locale/us/markets/stocks",
      {},
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`. */
  async snapshot(
    ticker: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`,
      {},
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** Snapshot gainers/losers via `direction`. */
  async movers(
    direction: "gainers" | "losers",
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      "v2/snapshot/locale/us/markets/stocks/directions",
      { direction },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v2/last/trade/{ticker}`. */
  async lastTrade(
    ticker: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/last/trade/${encodeURIComponent(ticker)}`,
      {},
      options,
    );
    return envelope(
      deepNumeric((payload as { results?: unknown })?.results ?? {}) as LooseData,
      meta(payload),
    );
  }

  /** `/v2/last/nbbo/{ticker}`. */
  async lastQuote(
    ticker: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v2/last/nbbo/${encodeURIComponent(ticker)}`,
      {},
      options,
    );
    return envelope(
      deepNumeric((payload as { results?: unknown })?.results ?? {}) as LooseData,
      meta(payload),
    );
  }

  /** `/v3/reference/dividends`. */
  async dividends(
    options: { ticker?: string; limit?: number } & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      "v3/reference/dividends",
      { ticker: options.ticker, limit: options.limit },
      options,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v3/reference/splits`. */
  async splits(
    options: { ticker?: string; limit?: number } & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      "v3/reference/splits",
      { ticker: options.ticker, limit: options.limit },
      options,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v2/reference/news`. */
  async news(
    options: { ticker?: string; limit?: number } & RequestOptions = {},
  ): Promise<MarketResponse<NewsArticle[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      "v2/reference/news",
      { ticker: options.ticker, limit: options.limit },
      options,
    );
    const data = resultsOf(payload).map((row) => {
      const r = deepNumeric(row) as Record<string, unknown>;
      const publisher = r.publisher as Record<string, unknown> | undefined;
      return {
        id: r.id as number | string | undefined,
        title: String(r.title ?? ""),
        author: optionalString(r.author),
        url: optionalString(r.article_url),
        source: optionalString(publisher?.name),
        publishedUtc: optionalString(r.published_utc)
          ? new Date(String(r.published_utc))
          : undefined,
        tickers: Array.isArray(r.tickers) ? (r.tickers as string[]) : [],
        description: optionalString(r.description),
      } satisfies NewsArticle;
    });
    return envelope(data, meta(payload));
  }

  /** `/v1/open-close/{ticker}/{date}` — daily ticker summary (incl. pre/after hours). */
  async dailyOpenClose(
    ticker: string,
    date: string,
    options?: RequestOptions & { adjusted?: boolean },
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v1/open-close/${encodeURIComponent(ticker)}/${encodeURIComponent(date)}`,
      { adjusted: options?.adjusted },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v3/trades/{ticker}` — tick-level trades. */
  async trades(
    ticker: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(
      `v3/trades/${encodeURIComponent(ticker)}`,
      params,
      signal ? { signal } : undefined,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v3/quotes/{ticker}` — NBBO quotes history. */
  async quotes(
    ticker: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(
      `v3/quotes/${encodeURIComponent(ticker)}`,
      params,
      signal ? { signal } : undefined,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v1/related-companies/{ticker}` — related tickers. */
  async related(
    ticker: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v1/related-companies/${encodeURIComponent(ticker)}`,
      {},
      options,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v3/reference/conditions` — unified trade/quote condition codes. */
  async conditions(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(
      "v3/reference/conditions",
      params,
      signal ? { signal } : undefined,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v3/snapshot` — unified multi-asset snapshot. */
  async unified(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(
      "v3/snapshot",
      params,
      signal ? { signal } : undefined,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `/v3/reference/tickers/{id}/events` — ticker change timeline. */
  async tickerEvents(
    id: string,
    options?: RequestOptions & { types?: string },
  ): Promise<MarketResponse<LooseData, AggsMeta>> {
    const payload = await this.api.get<unknown>(
      `v3/reference/tickers/${encodeURIComponent(id)}/events`,
      { types: options?.types },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta(payload));
  }

  /** `/v3/reference/ipos` — IPO calendar (since 2008). */
  async ipos(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(
      "v3/reference/ipos",
      params,
      signal ? { signal } : undefined,
    );
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  private async financials(
    path: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    const { signal, ...params } = options;
    const payload = await this.api.get<unknown>(path, params, signal ? { signal } : undefined);
    return envelope(
      resultsOf(payload).map((row) => deepNumeric(row) as LooseData),
      meta(payload),
    );
  }

  /** `GET /stocks/financials/v1/balance-sheets`. */
  async balanceSheets(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.financials("stocks/financials/v1/balance-sheets", options);
  }

  /** `GET /stocks/financials/v1/cash-flow-statements`. */
  async cashFlowStatements(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.financials("stocks/financials/v1/cash-flow-statements", options);
  }

  /** `GET /stocks/financials/v1/income-statements`. */
  async incomeStatements(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.financials("stocks/financials/v1/income-statements", options);
  }

  /** `GET /stocks/financials/v1/ratios`. */
  async ratios(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.financials("stocks/financials/v1/ratios", options);
  }

  /** `GET /stocks/v1/float` — free float. */
  async float(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.financials("stocks/v1/float", options);
  }

  /** `GET /stocks/v1/short-interest`. */
  async shortInterest(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.financials("stocks/v1/short-interest", options);
  }

  /** `GET /stocks/v1/short-volume`. */
  async shortVolume(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.financials("stocks/v1/short-volume", options);
  }

  /** `GET /stocks/filings/v1/index` — SEC EDGAR master index. */
  async filingsIndex(
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.financials("stocks/filings/v1/index", options);
  }

  /** SEC filing content passthrough (`10-k-sections`, `8-k-text`, `form-4`, ...). */
  async filings(
    path: string,
    options: Record<string, string | number | boolean | undefined> & RequestOptions = {},
  ): Promise<MarketResponse<LooseData[], AggsMeta>> {
    return this.financials(
      `stocks/filings/v1/${path.replace(/^stocks\/filings\/v1\//, "")}`,
      options,
    );
  }

  /** Generic passthrough for any other Massive REST endpoint. */
  async get<T = LooseData>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: RequestOptions,
  ): Promise<MarketResponse<T, AggsMeta>> {
    const payload = await this.api.get<unknown>(path, params, options);
    const results = (payload as { results?: unknown }).results;
    return envelope(
      (Array.isArray(results) ? results.map((row) => deepNumeric(row)) : deepNumeric(payload)) as T,
      meta(payload),
    );
  }
}
