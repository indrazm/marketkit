/** Shared small helpers. */

import { ParseError } from "@marketkit/core";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function optionalDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    // Yahoo mixes epoch seconds and milliseconds; disambiguate by magnitude.
    return new Date(value < 1e12 ? value * 1000 : value);
  }
  if (typeof value === "string" && value !== "") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : new Date(ms);
  }
  return undefined;
}

/** Yahoo `{raw, fmt}` value objects → the raw number. */
export function rawValue(value: unknown): number | undefined {
  if (typeof value === "number" || typeof value === "string") return optionalNumber(value);
  if (isRecord(value)) return optionalNumber(value.raw);
  return undefined;
}

/** Yahoo `{raw, fmt}` date-ish objects → Date (raw is usually epoch seconds). */
export function rawDate(value: unknown): Date | undefined {
  if (isRecord(value) && "raw" in value) return optionalDate(value.raw);
  return optionalDate(value);
}

export function strictNumber(value: unknown, field: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new ParseError(`yfinance: ${field}: expected number, got ${JSON.stringify(value)}`, {
      field,
    });
  }
  return parsed;
}

/** `Date | "YYYY-MM-DD" | epoch` → epoch seconds for `period1`/`period2`. */
export function toEpochSeconds(value: Date | string | number, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? Math.floor(value) : Math.floor(value / 1000);
  }
  const ms = value instanceof Date ? value.getTime() : Date.parse(`${value}`);
  if (Number.isNaN(ms)) {
    throw new ParseError(`yfinance: ${field}: unparsable date ${JSON.stringify(value)}`, {
      field,
    });
  }
  return Math.floor(ms / 1000);
}
