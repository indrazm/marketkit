/** Shared small helpers. */

import { ParseError } from "@marketkit/core";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function numeric(value: unknown): unknown {
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value;
}

/** Recursive numeric-string coercion, keys kept verbatim. */
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

export function strictNumber(value: unknown, field: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined) {
    throw new ParseError(`massive: ${field}: expected number, got ${JSON.stringify(value)}`, {
      field,
    });
  }
  return parsed;
}
