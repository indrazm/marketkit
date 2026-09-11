/**
 * Query layer: `https://api.massive.com/<path>` with `apiKey` query param,
 * envelope extraction (`{status, results, count, request_id, next_url}`), and
 * OHLCV-bar parsing for aggregates payloads.
 */

import { NotFoundError, ParseError, type Transport } from "@marketkit/core";
import { isRecord } from "./shared.js";

export const BASE_URL = "https://api.massive.com";

export interface MassiveApiOptions {
  apiKey: string;
  transport: Transport;
}

export class MassiveApi {
  readonly #apiKey: string;
  readonly #transport: Transport;

  constructor(options: MassiveApiOptions) {
    this.#apiKey = options.apiKey;
    this.#transport = options.transport;
  }

  async get<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    search.set("apiKey", this.#apiKey);
    const suffix = path === "" ? `?${search}` : `/${path}?${search}`;
    return this.#transport.json<T>(`${BASE_URL}${suffix}`, options);
  }

  /** Follow a `next_url` returned by a paginated endpoint. */
  async next<T>(nextUrl: string, options?: { signal?: AbortSignal }): Promise<T> {
    return this.#transport.json<T>(nextUrl, options);
  }
}

/** Meta object produced by the per-namespace `meta(payload)` helper. */
export interface MassiveMetaLite {
  provider: "massive";
  fetchedAt: Date;
  requestId?: string;
  status?: string;
  count?: number;
  nextUrl?: string;
}

/** Build the standard `{ data, meta }` envelope from a meta object. */
export function envelope<T>(data: T, metaObj: MassiveMetaLite): { data: T; meta: MassiveMetaLite } {
  return { data, meta: metaObj };
}

/** Shared envelope meta extractor — one copy used by every namespace. */
export function meta(payload: unknown): MassiveMetaLite {
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

/** Lenient `results` array extraction (missing → empty, never throws). */
export function resultsOf(payload: unknown): unknown[] {
  const rows = (payload as { results?: unknown }).results;
  return Array.isArray(rows) ? rows : [];
}

/** `results` array extraction. */
export function requireResults(payload: unknown, context: string): unknown[] {
  const record = isRecord(payload) ? payload : {};
  if (Array.isArray(record.results)) return record.results;
  throw new NotFoundError(`massive: ${context}: no results in response`, {
    provider: "massive",
  });
}

export type AggBar = {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  transactions?: number;
  vwap?: number;
};

/** Aggregates `results` rows: `{t, o, h, l, c, v?, n?, vw?}` (t = epoch ms). */
export function parseAggBars(payload: unknown): AggBar[] {
  const results = isRecord(payload) ? payload.results : undefined;
  if (!Array.isArray(results)) {
    throw new ParseError("massive: aggregates: expected results array", { field: "results" });
  }
  return results
    .map((row) => {
      const r = isRecord(row) ? row : {};
      if (typeof r.t !== "number") {
        throw new ParseError("massive: aggregate bar missing timestamp", { field: "t" });
      }
      const bar: AggBar = {
        timestamp: new Date(r.t),
        open: num(r.o),
        high: num(r.h),
        low: num(r.l),
        close: num(r.c),
      };
      if (typeof r.v === "number") bar.volume = r.v;
      if (typeof r.n === "number") bar.transactions = r.n;
      if (typeof r.vw === "number") bar.vwap = r.vw;
      return bar;
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

function num(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ParseError(`massive: expected number, got ${JSON.stringify(value)}`, {
      field: "agg",
    });
  }
  return parsed;
}
