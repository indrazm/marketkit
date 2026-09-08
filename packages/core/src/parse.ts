/**
 * PRD §23: lightweight custom parsing instead of a validation dependency.
 * Alpha Vantage responses need heavy normalization anyway; these helpers throw
 * `ParseError` with field context so failures are attributable.
 */

import { ParseError } from "./errors.js";

/** Type + truncated value for error messages, e.g. `"string \"239.00\""`. */
function describe(value: unknown): string {
  const label = value === null ? "null" : Array.isArray(value) ? "array" : `${typeof value} `;
  const text = typeof value === "string" ? JSON.stringify(value) : String(value);
  const truncated = text.length > 60 ? `${text.slice(0, 57)}...` : text;
  return `${label}${truncated}`;
}

export function parseRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ParseError(`${field}: expected object, got ${describe(value)}`, {
      field,
    });
  }
  return value as Record<string, unknown>;
}

export function parseString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ParseError(`${field}: expected string, got ${describe(value)}`, {
      field,
    });
  }
  return value;
}

export function parseOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return parseString(value, field);
}

export function parseNumber(value: unknown, field: string): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(parsed)) {
    throw new ParseError(`${field}: expected finite number, got ${describe(value)}`, { field });
  }
  return parsed;
}

export function parseOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return parseNumber(value, field);
}

export function parseInteger(value: unknown, field: string): number {
  const parsed = parseNumber(value, field);
  if (!Number.isInteger(parsed)) {
    throw new ParseError(`${field}: expected integer, got ${parsed}`, {
      field,
    });
  }
  return parsed;
}

/** PRD §24: returned runtime dates are `Date`; inputs may be `Date | string` (or epoch ms). */
export function parseDate(value: unknown, field: string): Date {
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) {
    throw new ParseError(`${field}: expected valid date, got ${describe(value)}`, { field });
  }
  return date;
}
