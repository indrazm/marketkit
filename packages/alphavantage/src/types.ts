/**
 * Public types for the Alpha Vantage provider (PRD §8–§20). Domain-oriented:
 * provider function names stay out of the call signatures.
 */

import type { DateString, ResponseMeta } from "@marketkit/core";

// ── Stocks ────────────────────────────────────────────────────────────────────

/** PRD §9: one interval type instead of six endpoint methods. */
export type StockInterval = "1m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1w" | "1mo";

/** Internal: request-level options shared by every method. */
export interface RequestOptionsShape {
  signal?: AbortSignal;
}

export interface HistoryOptions extends RequestOptionsShape {
  interval: StockInterval;
  /** Adjusted closes/dividends/splits where the provider supports them. For
   * intraday requests this maps to the provider's `adjusted` parameter. */
  adjusted?: boolean;
  /** `compact` (default, 100 points) or `full`. */
  outputsize?: "compact" | "full";
  /** Intraday only: include pre/post market hours. Default `true`. */
  extendedHours?: boolean;
  /** Intraday only: query a specific historical month, `YYYY-MM`. */
  month?: `${number}-${number}`;
  /** Premium data freshness control (intraday and quotes). */
  entitlement?: Entitlement;
}

/** PRD §8. */
export interface StockQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  latestTradingDay: string;
}

/** PRD §10. */
export interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
  dividend?: number;
  splitCoefficient?: number;
}

/**
 * FX candles: the provider reports no volume (a literal `"-"` bar), so volume
 * is optional here instead of silently violating `Candle.volume: number`.
 */
export interface ForexCandle extends Omit<Candle, "volume"> {
  volume?: number;
}

export interface StockHistoryMeta extends AlphaVantageMeta {
  interval?: StockInterval;
  adjusted?: boolean;
}

/** PRD §11. */
export interface Instrument {
  symbol: string;
  name: string;
  type?: string;
  region?: string;
  currency?: string;
  marketOpen?: string;
  marketClose?: string;
  timezone?: string;
  matchScore?: number;
}

export interface SearchOptions extends RequestOptionsShape {
  query: string;
}

// ── Market status ─────────────────────────────────────────────────────────────

export interface MarketStatusDay {
  marketType: string;
  region: string;
  primaryExchanges?: string;
  localOpen?: string;
  localClose?: string;
  currentStatus?: string;
  notes?: string;
}

// ── Fundamentals ──────────────────────────────────────────────────────────────

export interface OverviewOptions extends RequestOptionsShape {
  symbol: string;
}

export interface StatementsOptions extends RequestOptionsShape {
  symbol: string;
  /** `annual` (default) or `quarterly` reports. */
  quarter?: boolean;
}

/**
 * Financial-statement line items keep the provider's camelCase keys, with
 * `fiscalDateEnding` parsed to `Date`. Values stay verbatim (`number` when the
 * provider sends plain numerics, string otherwise) — normalizing every line
 * item would invent a universal financial model, which the PRD defers.
 */
export interface FinancialReport {
  fiscalDateEnding?: Date;
  reportedCurrency?: string;
  [lineItem: string]: string | number | Date | undefined;
}

export interface Statements {
  symbol: string;
  reports: FinancialReport[];
}

export interface EarningsReport {
  fiscalDateEnding: Date;
  reportedDate?: Date;
  reportedEPS?: number;
  estimatedEPS?: number;
  surprise?: number;
  surprisePercentage?: number;
}

export interface Earnings {
  symbol: string;
  annual: EarningsReport[];
  quarterly: EarningsReport[];
}

export interface EarningsCalendarOptions extends RequestOptionsShape {
  /** `"3month"` (default), `"6month"`, `"12month"`. */
  horizon?: "3month" | "6month" | "12month";
}

export interface EarningsCalendarEntry {
  symbol: string;
  name?: string;
  reportDate: string;
  currency?: string;
  fiscalDateEnding?: string;
  EPSestimate?: number;
  reportTime?: string;
}

export interface IpoCalendarEntry {
  symbol?: string;
  name?: string;
  ipoDate: string;
  currency?: string;
  priceRange?: string;
  shares?: number;
  exchange?: string;
  status?: string;
}

// ── News ──────────────────────────────────────────────────────────────────────

export interface NewsSearchOptions extends RequestOptionsShape {
  symbols?: string[];
  topics?: string[];
  from?: Date | string;
  to?: Date | string;
  /** Provider-supported buckets: 50 and 100. */
  limit?: number;
  sort?: "LATEST" | "RELEVANCE" | "TRENDING_SCORE";
}

export interface NewsSentiment {
  /** Provider's bipolar score, roughly [-1, 1]. */
  score: number;
  label: string;
}

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: Date;
  summary?: string;
  authors?: string[];
  image?: string;
  categories?: string[];
  sentiment?: NewsSentiment;
  tickers?: Array<{
    symbol: string;
    relevance: number;
    sentiment: number;
    label?: string;
  }>;
}

// ── Technical indicators ──────────────────────────────────────────────────────

export interface IndicatorIntervalOptions extends RequestOptionsShape {
  symbol: string;
  interval: StockInterval;
  /** Fast periods (SMA/EMA/RSI/ATR/ADX and friends). */
  period?: number;
  /** Which price series to compute against. Default `"close"`. */
  seriesType?: "close" | "open" | "high" | "low";
  /** Extra provider parameters passed through verbatim (e.g. `time_period`). */
  params?: Record<string, string | number>;
}

export interface MacdOptions extends IndicatorIntervalOptions {
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
}

export interface BbandsOptions extends MacdOptions {
  stdDev?: number;
  matype?: number;
}

export interface IndicatorPoint {
  timestamp: Date;
  value: number;
}

export interface MacdPoint {
  timestamp: Date;
  macd: number;
  signal: number;
  histogram: number;
}

export interface BbandsPoint {
  timestamp: Date;
  upper: number;
  middle: number;
  lower: number;
}

/** Provider-supported indicator names accepted by `indicators.get`. */
export type IndicatorName = KnownIndicatorName | (string & {});

/** Indicator names with dedicated result shapes. */
export type ShapedIndicatorName =
  | "macd"
  | "bbands"
  | "stoch"
  | "stochf"
  | "aroon"
  | "ht_sine"
  | "ht_phasor";

/** The well-known Alpha Vantage indicator functions (PRD §16). */
export type KnownIndicatorName = Exclude<
  | "sma"
  | "ema"
  | "wma"
  | "dema"
  | "tema"
  | "trima"
  | "kama"
  | "t3"
  | "macd"
  | "macdext"
  | "stoch"
  | "stochf"
  | "rsi"
  | "stochrsi"
  | "willr"
  | "adx"
  | "adxr"
  | "apo"
  | "ppo"
  | "mom"
  | "bop"
  | "cci"
  | "cmo"
  | "roc"
  | "rocr"
  | "trix"
  | "ultosc"
  | "dx"
  | "minus_di"
  | "plus_di"
  | "atr"
  | "natr"
  | "trange"
  | "obv"
  | "sar"
  | "bbands"
  | "mfi"
  | "mama"
  | "vwap"
  | "aroonosc"
  | "midpoint"
  | "midprice"
  | "sar"
  | "minus_dm"
  | "plus_dm"
  | "ad"
  | "adosc",
  ShapedIndicatorName
>;

// ── Forex ─────────────────────────────────────────────────────────────────────

export interface ForexPair {
  from: string;
  to: string;
}

export type ForexPairInput = ForexPair | `${string}/${string}`;

export interface ForexHistoryOptions extends RequestOptionsShape {
  interval: Exclude<StockInterval, "1m">;
  outputsize?: "compact" | "full";
}

export interface ForexQuote {
  from: string;
  to: string;
  rate: number;
  bid?: number;
  ask?: number;
  refreshedAt: Date;
  timezone?: string;
}

// ── Crypto ────────────────────────────────────────────────────────────────────

export interface CryptoPair extends RequestOptionsShape {
  symbol: string;
  currency: string;
}

export interface CryptoHistoryOptions extends CryptoPair {
  /** Intraday intervals use the premium `CRYPTO_INTRADAY` endpoint. */
  interval?: StockInterval;
  outputsize?: "compact" | "full";
  /** Intraday only: query a specific historical month, `YYYY-MM`. */
  month?: `${number}-${number}`;
}

export interface CryptoQuote {
  symbol: string;
  currency: string;
  rate: number;
  bid?: number;
  ask?: number;
  refreshedAt: Date;
  timezone?: string;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface OptionsChainOptions extends RequestOptionsShape {
  date?: DateString;
}

/**
 * Option contracts are returned with normalized lowerCamelCase keys and
 * numeric coercion for numeric-looking values; the provider's contract schema
 * varies between realtime and historical endpoints.
 */
export interface OptionContract {
  [field: string]: string | number | undefined;
}

// ── Raw ───────────────────────────────────────────────────────────────────────

export interface RawRequestOptions extends RequestOptionsShape {
  [parameter: string]: string | number | boolean | AbortSignal | undefined;
}

// ── Shared meta / envelope ────────────────────────────────────────────────────

/** PRD §21: endpoint-specific meta extending the generic response meta. */
export interface AlphaVantageMeta extends ResponseMeta {
  provider: "alphavantage";
  symbol?: string;
  lastRefreshed?: Date;
  timezone?: string;
  information?: string;
}

// ── Core stock extras (coverage) ──────────────────────────────────────────────

/** REALTIME_BULK_BID_ASK_PRICES row, keys normalized (premium endpoint). */
export interface BidAskQuote {
  [field: string]: string | number | undefined;
}

export interface BidAskOptions extends RequestOptionsShape {
  symbols: string[];
}

/** TOP_GAINERS_LOSERS mover row. */
export interface Mover {
  ticker: string;
  price: number;
  changeAmount: number;
  changePercentage: number;
  volume: number;
}

export interface TopMovers {
  lastUpdated?: string;
  topGainers: Mover[];
  topLosers: Mover[];
  mostActivelyTraded?: Mover;
}

export type Entitlement = "realtime" | "delayed";

export interface QuoteOptions extends RequestOptionsShape {
  entitlement?: Entitlement;
}

// ── Index data (premium) ──────────────────────────────────────────────────────

export type IndexInterval = "daily" | "weekly" | "monthly";

export interface IndexHistoryOptions extends RequestOptionsShape {
  symbol: string;
  interval: IndexInterval;
}

/**
 * Index history point. The endpoint returns OHLC time series; some index
 * catalogs return single-value series, in which case `open/high/low` stay
 * `undefined` and `close` carries the value.
 */
export interface IndexCandle {
  timestamp: Date;
  open?: number;
  high?: number;
  low?: number;
  close: number;
}

export interface IndexEntry {
  [field: string]: string | number | undefined;
}

// ── Options ratios ────────────────────────────────────────────────────────────

export interface OptionRatioOptions extends RequestOptionsShape {
  symbol: string;
  /** Use the historical endpoint (previous session or `date`). */
  historical?: boolean;
  /** `YYYY-MM-DD`, later than 2008-01-01; only with `historical: true`. */
  date?: DateString;
}

/** Realtime/historical put-call or volume-to-OI ratio payload, keys normalized. */
export interface OptionRatio {
  [field: string]: string | number | undefined;
}

// ── Alpha Intelligence (coverage) ─────────────────────────────────────────────

export interface TranscriptOptions extends RequestOptionsShape {
  symbol: string;
  /** `2024Q1`-style fiscal quarter, or `{ year: 2024, quarter: 1 }`. */
  quarter: string | { year: number; quarter: number };
}

export interface InsiderTransactionsOptions extends RequestOptionsShape {
  symbol: string;
  /** `YYYY-MM-DD` lower bound on transaction dates. */
  from?: DateString;
}

export interface CongressTradesOptions extends RequestOptionsShape {
  symbol?: string;
  bioguideId?: string;
}

export interface AnalyticsOptions extends RequestOptionsShape {
  symbols: string[];
  /**
   * `"full"`, `"{N}day"`, `"{N}week"`, `"{N}month"`, `"{N}year"` (intraday also
   * `"{N}minute"`, `"{N}hour"`), a `YYYY-MM`/`YYYY-MM-DD` date, or a
   * `[start, end]` pair (e.g. `["2023-07-01", "2023-08-31"]`).
   */
  range: string | [string, string];
  interval: StockInterval;
  /** e.g. `"MEAN"`, `"STDDEV(annualized=True)"`, `"MIN,MAX,CUMULATIVE_RETURN"`. */
  calculations: string;
  /** Price series to compute on. Default `"close"`. */
  ohlc?: "open" | "high" | "low" | "close";
  /** Sliding-window analytics only, e.g. `60`. */
  window?: number;
}

/**
 * Fixed/sliding-window analytics result. The provider's payload varies with
 * the requested calculations; keys are normalized and numerics coerced.
 */
export interface AnalyticsResult {
  [field: string]: unknown;
}

// ── Fundamentals additions ────────────────────────────────────────────────────

export interface CompanyLogo {
  symbol: string;
  url: string;
}

export interface EtfProfile {
  [field: string]: unknown;
}

export interface DividendEvent {
  amount: number;
  effectiveDate: Date;
}

export interface CorporateAction {
  symbol: string;
  events: DividendEvent[];
}

export interface SplitEvent {
  ratio: string;
  effectiveDate: Date;
}

export interface CorporateSplit {
  symbol: string;
  events: SplitEvent[];
}

export interface SharesOutstanding {
  [field: string]: unknown;
}

/** `EARNINGS_ESTIMATES` payload; keys normalized. */
export interface EarningsEstimates {
  [field: string]: unknown;
}

/** `LISTING_STATUS` CSV row. */
export interface ListingStatusEntry {
  symbol: string;
  name: string;
  exchange: string;
  assetType: string;
  ipoDate: string;
  delistingDate: string;
  status: string;
}

export interface ListingStatusOptions extends RequestOptionsShape {
  /** `YYYY-MM-DD` later than 2010-01-01; defaults to latest trading day. */
  date?: DateString;
  /** Default `"active"`. */
  state?: "active" | "delisted";
}

// ── Commodities & economy (shared series shape) ───────────────────────────────

export interface SeriesPoint {
  /** Provider date: `YYYY-MM-DD`, `YYYY-MM`, or `YYYY`. */
  date: string;
  value: number;
}

export interface EconomicSeries {
  name?: string;
  interval?: string;
  unit?: string;
  data: SeriesPoint[];
}

export type CommodityInterval = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

export interface CommodityHistoryOptions extends RequestOptionsShape {
  interval?: CommodityInterval;
}

export type CommodityName =
  | "gold"
  | "silver"
  | "wti"
  | "brent"
  | "natural_gas"
  | "copper"
  | "aluminum"
  | "wheat"
  | "corn"
  | "cotton"
  | "sugar"
  | "coffee"
  | "all";

export interface GoldSilverSpot {
  name?: string;
  price: number;
  updatedAt?: string;
  unit?: string;
}

// ── Economy ───────────────────────────────────────────────────────────────────

export interface TreasuryYieldOptions extends RequestOptionsShape {
  interval?: "daily" | "weekly" | "monthly";
  maturity?: "3month" | "2year" | "5year" | "7year" | "10year" | "30year";
}

export interface GdpOptions extends RequestOptionsShape {
  interval?: "quarterly" | "annual";
}

export interface IntervalOptions extends RequestOptionsShape {
  interval?: "daily" | "weekly" | "monthly";
}

export interface CpiOptions extends RequestOptionsShape {
  interval?: "monthly" | "semiannual";
}

// ── Multi-output indicator shapes ─────────────────────────────────────────────

export interface StochPoint {
  timestamp: Date;
  /** `SlowK` on STOCH, `FastK` on STOCHF. */
  k: number;
  /** `SlowD` on STOCH, `FastD` on STOCHF. */
  d: number;
}

export interface AroonPoint {
  timestamp: Date;
  up: number;
  down: number;
}

export interface HtSinePoint {
  timestamp: Date;
  sine: number;
  leadSine: number;
}

export interface HtPhasorPoint {
  timestamp: Date;
  quadrature: number;
  phase: number;
}
