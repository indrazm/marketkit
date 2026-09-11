/**
 * Public types for the Massive provider (api.massive.com). Domain-oriented;
 * provider response envelopes are `{status, request_id, results, count?}`.
 */

import type { ResponseMeta } from "@marketkit/core";

export interface RequestOptionsShape {
  signal?: AbortSignal;
}

/** Provider timespans for aggregates (docs: Custom Bars). */
export type Timespan = "minute" | "hour" | "day" | "week" | "month" | "quarter" | "year";

export interface AggsOptions extends RequestOptionsShape {
  /** Bars per timespan, e.g. `1`. */
  multiplier: number;
  timespan: Timespan;
  /** `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM:SS`, or epoch ms. */
  from: string | number;
  to: string | number;
  adjusted?: boolean;
  sort?: "asc" | "desc";
  /** Max bars per page (provider default 100, max 50000). */
  limit?: number;
}

/** OHLCV bar; `t` is epoch ms in provider payloads. */
export interface Candle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  transactions?: number;
  vwap?: number;
}

export interface AggsMeta extends MassiveMeta {
  nextUrl?: string;
  count?: number;
}

/** PRD §11 equivalent: `/v3/reference/tickers` rows. */
export interface Instrument {
  ticker: string;
  name?: string;
  type?: string;
  market?: string;
  locale?: string;
  currency?: string;
  exchange?: string;
  active?: boolean;
  primaryListing?: string;
  cik?: string;
  figi?: string;
}

/** Market status (`/v1/marketstatus/now`). */
export interface MarketStatus {
  market?: string;
  exchanges?: string;
  serverTime?: Date;
  [field: string]: unknown;
}

/** PRD §15 equivalent: `/v2/reference/news`. */
export interface NewsArticle {
  id?: number | string;
  title: string;
  author?: string;
  url?: string;
  source?: string;
  publishedUtc?: Date;
  tickers: string[];
  description?: string;
  keywords?: string[];
  insight?: unknown[];
}

/** Option contract snapshot row (`/v3/snapshot/options/{underlying}`). */
export interface OptionContractSnapshot {
  [field: string]: unknown;
}

/** Loose endpoints: keys verbatim (snake_case), numeric strings coerced. */
export interface LooseData {
  [field: string]: unknown;
}

/** Shared envelope meta. */
export interface MassiveMeta extends ResponseMeta {
  provider: "massive";
  requestId?: string;
  count?: number;
  nextUrl?: string;
}
