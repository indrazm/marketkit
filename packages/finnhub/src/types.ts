/**
 * Public types for the Finnhub provider. Domain-oriented, mirroring the other
 * MarketKit provider packages; cryptic provider keys (c/d/dp/pc/t) never leak
 * into public types.
 */

import type { ResponseMeta } from "@marketkit/core";

export interface RequestOptionsShape {
  signal?: AbortSignal;
}

export interface SymbolOptions extends RequestOptionsShape {
  /** ISO exchange code, e.g. `US`. */
  exchange?: string;
}

/** Finnhub candle resolutions we support (docs: Stock Candles). */
export type Resolution = "1min" | "5min" | "15min" | "30min" | "1h" | "1day" | "1week" | "1month";

/** PRD §9 equivalent: one `history()`; mapped to provider resolution codes. */
export interface HistoryOptions extends SymbolOptions {
  /** `YYYY-MM-DD` or unix seconds. */
  from: string | number;
  to: string | number;
  /** Candle resolution. Default `"1day"`. */
  resolution: Resolution;
  /** Per-point adjustment to split/dividend-adjusted prices. */
  adjusted?: boolean;
}

/** PRD §10 equivalent. */
export interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface StockHistoryMeta extends FinnhubMeta {
  resolution?: Resolution;
}

/** PRD §8 equivalent — decoded from the provider's single-letter keys. */
export interface StockQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePercent: number;
  asOf: Date;
}

/** PRD §11 equivalent. */
export interface Instrument {
  symbol: string;
  name: string;
  type?: string;
  region?: string;
  currency?: string;
  exchange?: string;
  micCode?: string;
  figi?: string;
  cik?: string;
}

/** Market status / holiday entries. */
export interface MarketStatus {
  exchange?: string;
  holiday?: string | null;
  timezone?: string | null;
  isOpen: boolean;
  session?: string | null;
}

export interface MarketHoliday {
  exchange: string;
  name: string;
  date: string;
  type: string;
}

// ── News ──────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  category: string;
  datetime: Date;
  headline: string;
  url: string;
  source: string;
  summary: string;
  image?: string;
  related: string;
  id: number;
}

export interface NewsSentimentBuzz {
  buzz?: number;
  articlesInLastWeek?: number;
  weeklyAverage?: number;
  companyNewsScore?: number;
  sectorAverageBullishPercent?: number;
  sectorAverageNewsScore?: number;
  bearishPercent?: number;
  bullishPercent?: number;
  [field: string]: unknown;
}

// ── Fundamentals ──────────────────────────────────────────────────────────────

export interface Profile {
  symbol?: string;
  name?: string;
  country?: string;
  currency?: string;
  exchange?: string;
  micCode?: string;
  ipoDate?: string;
  marketCapitalization?: number;
  shareOutstanding?: number;
  logo?: string;
  weburl?: string;
  phone?: string;
  industry?: string;
  finnhubIndustry?: string;
  ticker?: string;
}

export interface DividendEvent {
  amount: number;
  date: Date;
  recordDate?: Date;
  declarationDate?: Date;
  paymentDate?: Date;
}

export interface SplitEvent {
  date: Date;
  fromFactor: number;
  toFactor: number;
}

export interface EarningsSurprise {
  actual: number;
  estimate: number;
  period: Date;
  surprise: number;
  surprisePercent: number;
  symbol: string;
}

export interface Recommendation {
  symbol?: string;
  buy?: number;
  hold?: number;
  sell?: number;
  strongBuy?: number;
  strongSell?: number;
  period?: string;
}

export interface PriceTarget {
  lastUpdated?: string;
  symbol?: string;
  targetHigh?: number;
  targetLow?: number;
  targetMean?: number;
  targetMedian?: number;
  numberOfAnalysts?: number;
}

/** Loose endpoints: Finnhub keys are clean; values coerced where numeric. */
export interface LooseData {
  [field: string]: unknown;
}

// ── Forex / crypto ────────────────────────────────────────────────────────────

export interface ForexPair {
  from: string;
  to: string;
}

export type ForexPairInput = ForexPair | `${string}/${string}`;

export interface RateRow {
  base: string;
  /** e.g. `{ EUR: 0.92, JPY: 155.1 }` */
  rates: Record<string, number>;
  asOf: Date;
}

// ── Indicators ────────────────────────────────────────────────────────────────

export interface IndicatorOptions extends RequestOptionsShape {
  symbol: string;
  resolution: Resolution;
  from: string | number;
  to: string | number;
  /** Provider `time_period` where applicable. */
  period?: number;
  /** e.g. `{"fastkperiod": 5}` — passed through verbatim. */
  params?: Record<string, string | number>;
}

export interface IndicatorPoint {
  timestamp: Date;
  value: number;
}

// ── Shared meta / envelope ────────────────────────────────────────────────────

export interface FinnhubMeta extends ResponseMeta {
  provider: "finnhub";
  symbol?: string;
  resolution?: Resolution;
  exchange?: string;
  currency?: string;
}

export interface LooseMeta {
  provider: "finnhub";
  fetchedAt: Date;
}
