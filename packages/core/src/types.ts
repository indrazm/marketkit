/**
 * Structural fetch types. Deliberately not the global DOM types: the transport
 * must compile and run on Node, Bun, Deno, Cloudflare Workers and browsers
 * without pulling ambient lib definitions into the public API. A runtime
 * `fetch` is structurally compatible with `FetchLike`.
 */

export interface FetchHeadersLike {
  get(name: string): string | null;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers: FetchHeadersLike;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface FetchRequestInitLike {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export type FetchLike = (url: string, init?: FetchRequestInitLike) => Promise<FetchResponseLike>;

/** PRD §6: keep configuration small — these knobs are shared by every provider client. */
export interface RetryOptions {
  /** Total attempts per request, including the first. Default 2. */
  attempts?: number;
  backoff?: "exponential" | "fixed";
  /** Delay before the first retry. Default 500. */
  initialDelayMs?: number;
  /** Upper bound for exponential backoff. Default 8000. */
  maxDelayMs?: number;
  /** Apply half-jitter to retry delays. Default true. */
  jitter?: boolean;
}

export interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface ProviderConfig {
  apiKey: string;
  /** Per-attempt timeout in milliseconds. Default 10000. */
  timeout?: number;
  retry?: RetryOptions;
  fetch?: FetchLike;
  logger?: Logger;
}

/** PRD §24: date-only concepts, e.g. `"2026-09-08"`. */
export type DateString = `${number}-${number}-${number}`;

/** PRD §26: every request-level option hangs off this. */
export interface RequestOptions {
  signal?: AbortSignal;
}

/** PRD §21: generic metadata every response carries. */
export interface ResponseMeta {
  provider: string;
  fetchedAt: Date;
  requestId?: string;
}

/** PRD §10/§21: standardized envelope; endpoint-specific meta extends `ResponseMeta`. */
export interface MarketResponse<T, M extends ResponseMeta = ResponseMeta> {
  data: T;
  meta: M;
}
