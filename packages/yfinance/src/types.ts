/**
 * Public types for the Yahoo Finance provider (query1/query2.finance.yahoo.com).
 * Domain-oriented; Yahoo envelopes differ per endpoint family (chart / quote /
 * quoteSummary / optionChain / search / screener) and are normalized here.
 */

import type { ResponseMeta } from "@marketkit/core";

export interface RequestOptionsShape {
  signal?: AbortSignal;
}

/** Chart intervals (`Ticker.history`, yfinance parity). */
export type HistoryInterval =
  | "1m"
  | "2m"
  | "5m"
  | "15m"
  | "30m"
  | "60m"
  | "90m"
  | "1h"
  | "1d"
  | "5d"
  | "1wk"
  | "1mo"
  | "3mo";

/** Named ranges (`period`); `max` mirrors yfinance's full-history default. */
export type HistoryRange =
  | "1d"
  | "5d"
  | "1mo"
  | "3mo"
  | "6mo"
  | "1y"
  | "2y"
  | "5y"
  | "10y"
  | "ytd"
  | "max";

export interface HistoryOptions extends RequestOptionsShape {
  interval?: HistoryInterval;
  /**
   * Either a named `range`, or explicit `from`/`to` bounds (`Date`,
   * epoch seconds, or `YYYY-MM-DD`). Explicit bounds win over `range`.
   */
  range?: HistoryRange;
  from?: Date | string | number;
  to?: Date | string | number;
  /** Include pre/post-market data. Default false. */
  prepost?: boolean;
  /** Corporate-action events to request alongside bars. */
  events?: Array<"div" | "split" | "capitalGains">;
}

/** OHLCV bar with Yahoo's adjusted close and per-bar corporate actions. */
export interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose?: number;
  volume?: number;
  dividend?: number;
  split?: { numerator: number; denominator: number; ratio: string };
}

/** Dividend action row (`events.dividends`). */
export interface Dividend {
  timestamp: Date;
  amount: number;
}

/** Split action row (`events.splits`). */
export interface Split {
  timestamp: Date;
  numerator: number;
  denominator: number;
  ratio: string;
}

/** Corporate actions for a history window. */
export interface CorporateActions {
  dividends: Dividend[];
  splits: Split[];
}

/** Decoded v7 quote row (cryptic Yahoo keys stay out of the public surface). */
export interface Quote {
  symbol: string;
  name?: string;
  exchange?: string;
  currency?: string;
  price?: number;
  previousClose?: number;
  open?: number;
  high?: number;
  low?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  averageVolume?: number;
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  dividendYield?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  marketState?: string;
  quoteType?: string;
  asOf?: Date;
}

/** Single option contract row (calls/puts share the shape). */
export interface OptionContract {
  contractSymbol: string;
  strike: number;
  currency?: string;
  lastPrice?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
  impliedVolatility?: number;
  inTheMoney?: boolean;
  expiration?: Date;
  lastTradeDate?: Date;
}

/** One expiration slice of an option chain. */
export interface OptionChainSlice {
  expiration: Date;
  calls: OptionContract[];
  puts: OptionContract[];
}

/** Full chain response: slices for the requested (or all listed) expirations. */
export interface OptionChain {
  underlyingSymbol: string;
  expirations: Date[];
  slices: OptionChainSlice[];
}

/** Search hit (`v1/finance/search` quotes array). */
export interface SearchHit {
  symbol: string;
  name?: string;
  exchange?: string;
  quoteType?: string;
  typeDisplay?: string;
}

/** News article (search-embedded news). */
export interface NewsArticle {
  id?: string;
  title: string;
  url?: string;
  source?: string;
  publishedUtc?: Date;
  tickers: string[];
  summary?: string;
  imageUrl?: string;
}

/** Screener/movers row (loose: Yahoo finance fields vary by universe). */
export interface ScreenerRow {
  symbol: string;
  [field: string]: unknown;
}

/** quoteSummary module names (append `*Quarterly` history variants as needed). */
export type QuoteSummaryModule =
  | "price"
  | "summaryDetail"
  | "defaultKeyStatistics"
  | "assetProfile"
  | "summaryProfile"
  | "fundProfile"
  | "earningsHistory"
  | "earningsTrend"
  | "earnings"
  | "revenueEstimate"
  | "incomeStatementHistory"
  | "incomeStatementHistoryQuarterly"
  | "balanceSheetHistory"
  | "balanceSheetHistoryQuarterly"
  | "cashflowStatementHistory"
  | "cashflowStatementHistoryQuarterly"
  | "majorHoldersBreakdown"
  | "institutionOwnership"
  | "fundOwnership"
  | "insiderHolders"
  | "insiderTransactions"
  | "calendarEvents"
  | "secFilings"
  | "upgradeDowngradeHistory"
  | "recommendationTrend"
  | "priceTarget"
  | "esgScores"
  | "netSharePurchaseActivity"
  | "earningsTrendQuarterly"
  | (string & {});

/** Loose endpoints: keys verbatim, Yahoo rawValues kept where useful. */
export interface LooseData {
  [field: string]: unknown;
}

/** Shared envelope meta. */
export interface YahooMeta extends ResponseMeta {
  provider: "yfinance";
  exchange?: string;
  currency?: string;
}
