/**
 * Alpha Vantage response normalization helpers. Alpha Vantage keys are messy
 * ("4. close", "previous close", "local_open"): every parser funnels through
 * these so endpoint code stays declarative.
 */

import { NotFoundError, ParseError } from "@marketkit/core";

import type { Candle } from "./types.js";

/** Type + truncated value for error messages. */
export function describe(value: unknown): string {
  const text = typeof value === "string" ? JSON.stringify(value) : String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/** Prettier-style "2. Symbol" → "symbol", "previous close" → "previousClose". */
export function normalizeKey(key: string): string {
  return key
    .replace(/^[^A-Za-z]*/, "")
    .replace(/[-_.\s]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""))
    .replace(/^([A-Z])/, (c) => c.toLowerCase());
}

/** Coerce a string that plainly looks like a number; leave others untouched. */
export function numeric(value: unknown): string | number {
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value as string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * "01. symbol" → symbol, "5. volume" → volume — pick the first value whose key
 * matches ANY keyword (alternatives, e.g. "close" or "last"). Prefer the entry
 * matching the most keywords when several match.
 */
export function field(record: Record<string, unknown>, ...keywords: string[]): unknown {
  let best: { key: unknown; score: number } | undefined;
  for (const [key, value] of Object.entries(record)) {
    const normalized = normalizeKey(key).toLowerCase();
    const score = keywords.filter((k) => normalized.includes(k)).length;
    if (score > 0 && (!best || score > best.score)) best = { key: value, score };
  }
  return best?.key;
}

export function requireRecord(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ParseError(`alphavantage: ${where}: expected object, got ${describe(value)}`, {
      field: where,
    });
  }
  return value;
}

/** First record-valued entry, for envelope shapes we don't hardcode. */
export function findRecordSection(
  payload: unknown,
  ...names: string[]
): Record<string, unknown> | undefined {
  const record = requireRecord(payload, "response");
  for (const name of names) {
    const section = Object.entries(record).find(
      ([key]) => normalizeKey(key).toLowerCase() === name,
    );
    if (section && isRecord(section[1])) return section[1];
  }
  return Object.values(record).find(isRecord);
}

/** First array-valued entry under one of `names`, else the first array found. */
export function findArraySection(payload: unknown, ...names: string[]): unknown[] {
  const record = requireRecord(payload, "response");
  for (const name of names) {
    const section = Object.entries(record).find(
      ([key]) => normalizeKey(key).toLowerCase() === name,
    );
    if (section && Array.isArray(section[1])) return section[1];
  }
  const array = Object.values(record).find((value): value is unknown[] => Array.isArray(value));
  if (array) return array;
  throw new ParseError("alphavantage: expected an array section in response", {
    field: names[0] ?? "response",
  });
}

/**
 * Lowercase keyword-based candle extraction: works for equities, FX and crypto.
 * Required fields (OHLC, plus volume unless `volume: "optional"`) throw
 * `ParseError` on missing or non-numeric values; optional fields become
 * `undefined` rather than leaking strings into `Candle`.
 *
 * The generic parameter selects the result type: `Candle` (default) for
 * equities/crypto with `volume: "required"` (default), or `ForexCandle` with
 * `volume: "optional"` — the caller's type must match the option it passes.
 */
export interface CandleParseOptions {
  /** `"required"` (default, equities/crypto) or `"optional"` (FX has no volume). */
  volume?: "required" | "optional";
  /** Crypto: prefer keys tagged with this currency, e.g. `"4a. close (USD)"`. */
  currency?: string;
}

export function recordToCandle<T = Candle>(
  record: Record<string, unknown>,
  timestamp: string,
  options: CandleParseOptions = {},
): T {
  const toNumber = (raw: unknown, field: string): number | undefined => {
    if (raw === undefined || raw === null || raw === "") return undefined;
    const parsed = typeof raw === "string" ? Number(raw) : (raw as unknown);
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
      throw new ParseError(`alphavantage: candle ${field}: expected number, got ${describe(raw)}`, {
        field,
      });
    }
    return parsed;
  };

  const strict = (keywords: string[]): number => {
    const parsed = toNumber(field(record, ...keywords), keywords.join("/"));
    if (parsed === undefined) {
      throw new ParseError(`alphavantage: candle: missing ${keywords.join("/")}`, {
        field: keywords.join("_"),
      });
    }
    return parsed;
  };
  const lenient = (keywords: string[]): number | undefined => {
    // Optional semantics: absent OR provider placeholder ("-") → undefined.
    const raw = field(record, ...keywords);
    if (raw === undefined || raw === null || raw === "") return undefined;
    const parsed = typeof raw === "string" ? Number(raw) : (raw as unknown);
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
  };

  const byKeyword = (...keywords: string[]): unknown => {
    // e.g. crypto: "4a. close (USD)" / "4b. close (EUR)" — prefer the requested currency.
    if (options.currency) {
      for (const [key, value] of Object.entries(record)) {
        const normalized = normalizeKey(key).toLowerCase();
        if (
          keywords.every((k) => normalized.includes(k)) &&
          normalized.includes(options.currency.toLowerCase())
        ) {
          return value;
        }
      }
    }
    return field(record, ...keywords);
  };
  const strictWithCurrency = (keywords: string[]): number => {
    const parsed = toNumber(byKeyword(...keywords), keywords.join("/"));
    if (parsed === undefined) {
      throw new ParseError(`alphavantage: candle: missing ${keywords.join("/")}`, {
        field: keywords.join("_"),
      });
    }
    return parsed;
  };
  const lenientWithCurrency = (keywords: string[]): number | undefined =>
    toNumber(byKeyword(...keywords), keywords.join("/"));

  const ohlcStrict = options.currency ? strictWithCurrency : strict;

  return {
    timestamp: parseTimestamp(timestamp),
    open: ohlcStrict(["open"]),
    high: ohlcStrict(["high"]),
    low: ohlcStrict(["low"]),
    close: ohlcStrict(["close"]),
    volume: options.volume === "optional" ? lenient(["volume"]) : strict(["volume"]),
    adjustedClose: lenientWithCurrency(["adjustedclose"]),
    dividend: lenient(["dividend"]),
    splitCoefficient: lenient(["splitcoefficient"]),
  } as T;
}

/** "2026-09-08", "2026-09-08 16:00:00", "2026-09-08T16:00:00" → Date (UTC). */
export function parseTimestamp(value: string): Date {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parsedDate(`${trimmed}T00:00:00Z`, value);
  }
  const withT = trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed;
  const zoned = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(withT) ? withT : `${withT}Z`;
  return parsedDate(zoned, value);
}

function parsedDate(iso: string, original: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new ParseError(`alphavantage: invalid timestamp ${describe(original)}`, {
      field: "timestamp",
    });
  }
  return date;
}

/** "20260908T120000" (news `time_published`) → Date. */
export function parseCompactDate(value: string): Date {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(value.trim());
  if (!match) {
    throw new ParseError(`alphavantage: invalid compact timestamp ${describe(value)}`, {
      field: "time_published",
    });
  }
  const [, y, m, d, hh = "00", mm = "00", ss = "00"] = match;
  return new Date(
    Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss)),
  );
}

/** PRD §15: `from`/`to` accept `Date | string`; the provider wants yyyyMMddTHHmmss. */
export function toProviderDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ParseError(`alphavantage: invalid date ${describe(value)}`, { field: "date" });
  }
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

export function requireSymbol(record: Record<string, unknown>, context: string): string {
  const symbol = field(record, "symbol");
  if (typeof symbol !== "string" || symbol === "") {
    throw new NotFoundError(`alphavantage: ${context}: no symbol in response`);
  }
  return symbol;
}

export function requireNumber(record: Record<string, unknown>, ...keywords: string[]): number {
  const raw = field(record, ...keywords);
  const parsed = typeof raw === "string" ? Number(raw.replace(/%$/, "")) : (raw as number);
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) {
    throw new ParseError(
      `alphavantage: expected number at ${keywords.join("/")}, got ${describe(raw)}`,
      {
        field: keywords.join("_"),
      },
    );
  }
  return parsed;
}

export function optionalNumber(
  record: Record<string, unknown>,
  ...keywords: string[]
): number | undefined {
  const raw = field(record, ...keywords);
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed = typeof raw === "string" ? Number(raw.replace(/%$/, "")) : raw;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

export function optionalString(
  record: Record<string, unknown>,
  ...keywords: string[]
): string | undefined {
  const raw = field(record, ...keywords);
  return typeof raw === "string" && raw !== "" ? raw : undefined;
}

/** Minimal RFC-4180-ish CSV parser for the calendar endpoints (CSV responses). */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
  if (nonEmpty.length === 0) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const entry: Record<string, string> = {};
    header.forEach((key, i) => {
      entry[key] = (r[i] ?? "").trim();
    });
    return entry;
  });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Deeply normalize keys (lowerCamelCase) and coerce numerics through
 * objects/arrays. All-caps keys are preserved verbatim: they are typically
 * identifiers (tickers like `AAPL`, calculation names like `STDDEV`), not
 * snake_case fields.
 */
export function deepNormalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(deepNormalize);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const isAcronym = /^[A-Z0-9_]+$/.test(key);
    const normalized = isAcronym ? key : normalizeKey(key);
    out[normalized] =
      typeof item === "string" || typeof item === "number" ? numeric(item) : deepNormalize(item);
  }
  return out;
}

/** `{ name, interval, unit, data: [{ date, value }] }` — commodities/economy shape. */
export function parseValueSeries(payload: unknown): {
  name?: string;
  interval?: string;
  unit?: string;
  data: Array<{ date: string; value: number }>;
} {
  const record = requireRecord(payload, "response");
  const raw = record.data;
  if (!Array.isArray(raw)) {
    throw new ParseError("alphavantage: series: expected data array", { field: "data" });
  }
  const data = raw.map((entry) => {
    const row = requireRecord(entry, "data[]");
    const date = row.date;
    const value = row.value;
    if (typeof date !== "string" || typeof value !== "string" || !Number.isFinite(Number(value))) {
      throw new ParseError(`alphavantage: series: invalid point ${JSON.stringify(entry)}`, {
        field: "data[]",
      });
    }
    return { date, value: Number(value) };
  });
  const name = typeof record.name === "string" ? record.name : undefined;
  const interval = typeof record.interval === "string" ? record.interval : undefined;
  const unit = typeof record.unit === "string" ? record.unit : undefined;
  return { name, interval, unit, data };
}
