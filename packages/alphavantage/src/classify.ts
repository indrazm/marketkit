/**
 * PRD §22: Alpha Vantage signals API-level failure inside HTTP 200 payloads
 * (`Note`, `Information`, `Error Message`, `Detail`). The transport only sees
 * HTTP semantics, so the provider classifies payloads here.
 */

import {
  AuthenticationError,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
  type MarketKitError,
} from "@marketkit/core";

export function classifyAlphaVantagePayload(payload: unknown): MarketKitError | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;

  const errorMessage = stringField(record, "Error Message", "error message", "errormessage");
  if (errorMessage) {
    return new InvalidRequestError(`alphavantage: ${errorMessage}`, {
      provider: "alphavantage",
      code: "invalid_symbol_or_parameters",
    });
  }

  const note = stringField(record, "Note");
  if (note) {
    return new RateLimitError(`alphavantage: ${note}`, { provider: "alphavantage" });
  }

  const information = stringField(record, "Information", "information");
  if (information) {
    const lower = information.toLowerCase();
    if (
      lower.includes("rate limit") ||
      lower.includes("api call frequency") ||
      lower.includes("calls per")
    ) {
      return new RateLimitError(`alphavantage: ${information}`, { provider: "alphavantage" });
    }
    if (lower.includes("premium") || lower.includes("subscribe")) {
      return new AuthenticationError(`alphavantage: ${information}`, {
        provider: "alphavantage",
        code: "premium_endpoint",
      });
    }
    // "Information" with an unrecognized body: treat as rate limiting, the
    // common case, but surface the original text.
    return new RateLimitError(`alphavantage: ${information}`, { provider: "alphavantage" });
  }

  const detail = stringField(record, "Detail");
  if (detail) {
    return new InvalidRequestError(`alphavantage: ${detail}`, { provider: "alphavantage" });
  }

  return null;
}

/**
 * PRD §8 nuance: GLOBAL_QUOTE answers an unknown symbol with `{}` at HTTP 200.
 * Endpoints call this to convert an effectively-empty payload into an error.
 */
export function requireNonEmptyPayload(payload: unknown, context: string): Record<string, unknown> {
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    Object.keys(payload).length === 0
  ) {
    throw new NotFoundError(`alphavantage: ${context}: empty response (unknown symbol?)`, {
      provider: "alphavantage",
    });
  }
  return payload as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const [key, value] of Object.entries(record)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
    if (
      names.some((n) => n.toLowerCase().replace(/[^a-z]/g, "") === normalized) &&
      typeof value === "string"
    ) {
      return value;
    }
  }
  return undefined;
}
