/**
 * Public types for the Twelve Data provider. Domain-oriented, mirroring the
 * alphavantage package: provider endpoint names stay out of call signatures.
 */

import type { ResponseMeta } from "@marketkit/core";

/** Twelve Data interval vocabulary (docs: Time series > Interval). */
export type Interval =
  | "1min"
  | "5min"
  | "15min"
  | "30min"
  | "45min"
  | "1h"
  | "2h"
  | "4h"
  | "1day"
  | "1week"
  | "1month";

export interface RequestOptionsShape {
  signal?: AbortSignal;
}

/** Shared request options: TD accepts an exchange to disambiguate symbols. */
export interface SymbolOptions extends RequestOptionsShape {
  exchange?: string;
  micCode?: string;
  country?: string;
}

/** PRD §9 equivalent: one `history()` across all resolutions. */
export interface HistoryOptions extends SymbolOptions {
  interval: Interval;
  /** `compact` (TD default) or a number of points. */
  outputsize?: number | "compact";
  /** `YYYY-MM-DD`; provider `start_date`. */
  startDate?: string;
  /** `YYYY-MM-DD`; provider `end_date`. */
  endDate?: string;
  /** IANA timezone for returned datetimes, e.g. `America/New_York`. */
  timezone?: string;
  /** Include split-adjusted values. */
  splits?: boolean;
  /** Include dividend-adjusted values. */
  dividends?: boolean;
  /** Newest-first (default) or oldest-first ordering. */
  order?: "asc" | "desc";
}

/** PRD §10 equivalent: OHLCV point; volume absent on FX/index series. */
export interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StockHistoryMeta extends TwelveDataMeta {
  interval?: string;
}

/** PRD §8 equivalent. */
export interface StockQuote {
  symbol: string;
  name?: string;
  exchange?: string;
  currency?: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume?: number;
  averageVolume?: number;
  isMarketOpen?: boolean;
  fiftyTwoWeek?: {
    low?: number;
    high?: number;
    lowChange?: number;
    highChange?: number;
    lowChangePercent?: number;
    highChangePercent?: number;
    range?: string;
  };
  asOf?: Date;
}

/** PRD §11 equivalent. */
export interface Instrument {
  symbol: string;
  name: string;
  exchange?: string;
  micCode?: string;
  country?: string;
  currency?: string;
  type?: string;
}

/** `MARKET_STATE` market row. */
export interface MarketStatusEntry {
  market: string;
  currentStatus?: string;
  [field: string]: string | number | undefined;
}

/** `MARKET_MOVERS` entry. */
export interface Mover {
  symbol: string;
  name?: string;
  exchange?: string;
  micCode?: string;
  country?: string;
  currency?: string;
  type?: string;
  close: number;
  change?: number;
  percentChange?: number;
  volume?: number;
  logginess?: string;
}

export interface TopMovers {
  lastUpdated?: string;
  topGainers: Mover[];
  topLosers: Mover[];
}

// ── Fundamentals ──────────────────────────────────────────────────────────────

export interface Profile {
  [field: string]: string | number | undefined;
}

export interface StatementsOptions extends RequestOptionsShape {
  symbol: string;
  /** `quarter` (default) or `annual`. */
  period?: "quarter" | "annual";
}

export interface StatementReport {
  fiscalDate?: Date;
  [lineItem: string]: string | number | Date | undefined;
}

export interface Statements {
  symbol: string;
  reports: StatementReport[];
}

export interface EarningsEvent {
  date?: Date;
  epsActual?: number;
  epsEstimate?: number;
  difference?: number;
  surprisePercent?: number;
  time?: string;
  beforeAfterMarket?: string;
}

export interface Earnings {
  symbol: string;
  earnings: EarningsEvent[];
}

export interface DividendEvent {
  exDate?: Date;
  paymentDate?: Date;
  recordDate?: Date;
  declaredDate?: Date;
  amount: number;
}

export interface Dividends {
  symbol: string;
  dividends: DividendEvent[];
}

export interface SplitEvent {
  date?: Date;
  ratio: string;
  splitTo?: number;
  splitFrom?: number;
}

export interface Splits {
  symbol: string;
  splits: SplitEvent[];
}

/** `LOGO` payload. */
export interface CompanyLogo {
  symbol: string;
  url?: string;
  background?: string;
  foreground?: string;
}

/** Statistics and other loose fundamentals: keys verbatim (clean camelCase). */
export interface LooseData {
  [field: string]: unknown;
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface OptionsChainOptions extends RequestOptionsShape {
  symbol: string;
  exchange?: string;
}

export interface OptionContract {
  [field: string]: string | number | undefined;
}

// ── Forex / crypto / commodities ──────────────────────────────────────────────

export interface ForexPair {
  from: string;
  to: string;
}

export type ForexPairInput = ForexPair | `${string}/${string}`;

export interface RateQuote {
  symbol: string;
  rate: number;
  asOf?: Date;
}

// ── Calendars ─────────────────────────────────────────────────────────────────

export interface EarningsCalendarOptions extends RequestOptionsShape {
  date?: string;
  /** `ipo` (default), `earnings`, `split`, `dividend` semantics per endpoint. */
  period?: "quarter" | "annual";
  country?: string;
}

// ── Indicators ────────────────────────────────────────────────────────────────

export interface IndicatorOptions extends RequestOptionsShape {
  symbol: string;
  interval: Interval;
  exchange?: string;
  period?: number;
  seriesType?: "open" | "high" | "low" | "close";
  /** Extra provider parameters passed through verbatim. */
  params?: Record<string, string | number>;
}

export interface IndicatorPoint {
  timestamp: Date;
  value: number;
}

export interface MacdOptions extends IndicatorOptions {
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
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

export interface StochPoint {
  timestamp: Date;
  k: number;
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

/** Provider-supported indicator names (docs: Technical indicators). */
export type IndicatorName = KnownIndicatorName | (string & {});

export type ShapedIndicatorName =
  | "macd"
  | "bbands"
  | "stoch"
  | "stochf"
  | "aroon"
  | "ht_sine"
  | "ht_phasor";

export type KnownIndicatorName = Exclude<
  | "sma"
  | "ema"
  | "wma"
  | "dema"
  | "tema"
  | "trima"
  | "kama"
  | "t3ma"
  | "mama"
  | "ma"
  | "vwap"
  | "macd"
  | "macdext"
  | "rsi"
  | "stochrsi"
  | "willr"
  | "adx"
  | "adxr"
  | "apo"
  | "ppo"
  | "mom"
  | "roc"
  | "rocp"
  | "rocr"
  | "rocr100"
  | "atr"
  | "natr"
  | "trange"
  | "obv"
  | "mfi"
  | "cci"
  | "cmo"
  | "dx"
  | "minus_di"
  | "plus_di"
  | "minus_dm"
  | "plus_dm"
  | "sar"
  | "sarext"
  | "supertrend"
  | "keltner"
  | "ultosc"
  | "dpo"
  | "kst"
  | "coppock"
  | "mcginley_dynamic"
  | "linearreg"
  | "linearregangle"
  | "linearregintercept"
  | "linearregslope"
  | "tsf"
  | "stddev"
  | "var"
  | "tsi"
  | "crsi"
  | "beta"
  | "correl"
  | "bop"
  | "trix"
  | "pivot_points_hl"
  | "heikinashicandles"
  | "supertrend_heikinashicandles"
  | "avgprice"
  | "hlc3"
  | "typprice"
  | "wclprice"
  | "medprice"
  | "midpoint"
  | "midprice"
  | "max"
  | "min"
  | "sum"
  | "ceil"
  | "floor"
  | "ln"
  | "log10"
  | "sqrt"
  | "exp"
  | "div"
  | "mult"
  | "sub"
  | "add"
  | "maxindex"
  | "minindex"
  | "minmax"
  | "minmaxindex"
  | "avg"
  | "rvol"
  | "percent_b"
  | "macd_slope",
  ShapedIndicatorName
>;

// ── Shared meta / envelope ────────────────────────────────────────────────────

/** PRD §21 equivalent: endpoint meta extending the generic response meta. */
export interface TwelveDataMeta extends ResponseMeta {
  provider: "twelvedata";
  symbol?: string;
  exchange?: string;
  micCode?: string;
  currency?: string;
  interval?: string;
  timezone?: string;
}

export type CommodityName =
  | "wti"
  | "brent"
  | "natural_gas"
  | "heating_oil"
  | "gasoline"
  | "copper"
  | "aluminum"
  | "zinc"
  | "nickel"
  | "gold"
  | "silver"
  | "palladium"
  | "platinum";
