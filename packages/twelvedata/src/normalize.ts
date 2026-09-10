/**
 * Twelve Data normalization: values arrive as numeric strings; dates are
 * `YYYY-MM-DD` or `YYYY-MM-DD HH:MM:SS` (exchange-local unless a timezone
 * parameter is given — treated as UTC for consistency).
 */

import { NotFoundError, ParseError, type ResponseMeta } from "@marketkit/core";

import { isRecord } from "./api.js";

export function describe(value: unknown): string {
  const text = typeof value === "string" ? JSON.stringify(value) : String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

export function numeric(value: unknown): string | number {
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value as string;
}

/** Strict numeric coercion: `""`/`"-"`/garbage → `undefined`, never a string. */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function strictNumber(value: unknown, field: string): number {
  const parsed = toNumber(value);
  if (parsed === undefined) {
    throw new ParseError(`twelvedata: ${field}: expected number, got ${describe(value)}`, {
      field,
    });
  }
  return parsed;
}

export function optionalNumber(value: unknown): number | undefined {
  return toNumber(value);
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function requireRecord(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ParseError(`twelvedata: ${where}: expected object, got ${describe(value)}`, {
      field: where,
    });
  }
  return value;
}

/** `"2026-09-08"` or `"2026-09-08 16:00:00"` → Date (UTC). */
export function parseTimestamp(value: string): Date {
  const trimmed = value.trim();
  const withT = trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed;
  const zoned = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(withT) ? withT : `${withT}Z`;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00Z` : zoned);
  if (Number.isNaN(date.getTime())) {
    throw new ParseError(`twelvedata: invalid timestamp ${describe(value)}`, { field: "datetime" });
  }
  return date;
}

/** `{ meta: {...}, values: [...] }` → newest-first `Candle[]`. */
export function parseCandles(
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
  const record = requireRecord(payload, "response");
  const values = record.values;
  if (!Array.isArray(values)) {
    throw new ParseError("twelvedata: expected values array in response", { field: "values" });
  }
  return values.map((entry) => {
    const row = requireRecord(entry, "values[]");
    const datetime = row.datetime;
    if (typeof datetime !== "string") {
      throw new ParseError("twelvedata: candle row missing datetime", { field: "datetime" });
    }
    const volume = toNumber(row.volume);
    if (requireVolume && volume === undefined) {
      throw new ParseError("twelvedata: candle row missing volume", { field: "volume" });
    }
    return {
      timestamp: parseTimestamp(datetime),
      open: strictNumber(row.open, "open"),
      high: strictNumber(row.high, "high"),
      low: strictNumber(row.low, "low"),
      close: strictNumber(row.close, "close"),
      volume,
    };
  });
}

/** Twelve Data payload meta block (`meta.symbol`, `meta.exchange`, ...). */
export function parseMeta(payload: unknown, fallbackSymbol?: string): TwelveDataMetaFields {
  const meta: TwelveDataMetaFields = {
    provider: "twelvedata",
    fetchedAt: new Date(),
    symbol: fallbackSymbol,
  };
  if (!isRecord(payload)) return meta;
  const section = payload.meta;
  if (!isRecord(section)) return meta;
  return {
    provider: "twelvedata",
    fetchedAt: new Date(),
    symbol: optionalString(section.symbol) ?? fallbackSymbol,
    exchange: optionalString(section.exchange),
    micCode: optionalString(section.mic_code),
    currency: optionalString(section.currency),
    interval: optionalString(section.interval),
    timezone: optionalString(section.timezone),
  };
}

export interface TwelveDataMetaFields extends ResponseMeta {
  provider: "twelvedata";
  symbol?: string;
  exchange?: string;
  micCode?: string;
  currency?: string;
  interval?: string;
  timezone?: string;
}

export function envelope<T>(
  data: T,
  meta: TwelveDataMetaFields,
): { data: T; meta: TwelveDataMetaFields } {
  return { data, meta };
}

/** Loose row normalization for schema-variable endpoints. */
export function normalizeRow(row: unknown): Record<string, unknown> {
  const record = requireRecord(row, "row");
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = typeof value === "string" || typeof value === "number" ? numeric(value) : value;
  }
  return out;
}

/** Ticker symbols in TD are comma-joined for batch endpoints. */
export function assertSymbol(symbol: string): string {
  if (typeof symbol !== "string" || symbol.trim() === "") {
    throw new NotFoundError("twelvedata: symbol is required", { provider: "twelvedata" });
  }
  return symbol.trim();
}

/** Recursive numeric-string coercion, keys kept verbatim (TD keys are clean). */
export function deepNumeric(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepNumeric);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] =
      typeof item === "string" || typeof item === "number" ? numeric(item) : deepNumeric(item);
  }
  return out;
}
