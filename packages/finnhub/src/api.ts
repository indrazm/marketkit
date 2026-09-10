/**
 * Query layer: `https://finnhub.io/api/v1/<path>?...&token=...`, plus
 * normalization for Finnhub's column-oriented candle payloads and unix-second
 * timestamps.
 */

import { ParseError, type Transport } from "@marketkit/core";

import type { FinnhubMeta } from "./types.js";
import { isRecord } from "./shared.js";

export const BASE_URL = "https://finnhub.io/api/v1";

export interface FinnhubApiOptions {
  apiKey: string;
  transport: Transport;
}

export class FinnhubApi {
  readonly #apiKey: string;
  readonly #transport: Transport;

  constructor(options: FinnhubApiOptions) {
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
    search.set("token", this.#apiKey);
    const suffix = path === "" ? `?${search}` : `/${path}?${search}`;
    return this.#transport.json<T>(`${BASE_URL}${suffix}`, options);
  }
}

export function envelope<T>(data: T, meta: FinnhubMeta): { data: T; meta: FinnhubMeta } {
  return { data, meta };
}

export function meta(extra: Partial<FinnhubMeta> = {}): FinnhubMeta {
  return { provider: "finnhub", fetchedAt: new Date(), ...extra };
}

/** `"2026-09-08"` or `1725801600` → Date. */
export function parseTimestamp(value: string | number): Date {
  const date =
    typeof value === "number"
      ? new Date(value * 1000)
      : new Date(/^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? `${value.trim()}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) {
    throw new ParseError(`finnhub: invalid timestamp ${JSON.stringify(value)}`, {
      field: "timestamp",
    });
  }
  return date;
}

/** Column-oriented candle payload (`{c:[], h:[], l:[], o:[], v:[], t:[], s}`) → rows. */
export function parseCandleColumns(
  payload: unknown,
  requireVolume: boolean,
): Array<{
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}> {
  const record = isRecord(payload) ? payload : {};
  const columns = ["t", "o", "h", "l", "c"] as const;
  const volumes = record.v;
  for (const key of columns) {
    if (!Array.isArray(record[key])) {
      throw new ParseError(`finnhub: candles: missing "${key}" column`, { field: key });
    }
  }
  const length = (record.t as unknown[]).length;
  if (requireVolume && !Array.isArray(volumes)) {
    throw new ParseError("finnhub: candles: missing volume column", { field: "v" });
  }
  const rows: Array<{
    timestamp: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }> = [];
  for (let i = 0; i < length; i++) {
    const t = (record.t as unknown[])[i];
    const open = (record.o as unknown[])[i];
    const high = (record.h as unknown[])[i];
    const low = (record.l as unknown[])[i];
    const close = (record.c as unknown[])[i];
    const volume = Array.isArray(volumes) ? volumes[i] : undefined;
    if (typeof t !== "number") {
      throw new ParseError(`finnhub: candles: invalid timestamp at index ${i}`, { field: "t" });
    }
    rows.push({
      timestamp: new Date(t * 1000),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: typeof volume === "number" ? volume : undefined,
    });
  }
  return rows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
