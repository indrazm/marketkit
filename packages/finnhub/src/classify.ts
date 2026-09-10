/**
 * Finnhub signal classification. Finnhub uses proper HTTP status codes for
 * auth/quota (handled by the transport), but also returns `{"error": "..."}`
 * payloads and candle responses with `s: "no_data"`.
 */

import { MarketKitError, NotFoundError } from "@marketkit/core";

export function classifyFinnhubPayload(payload: unknown): MarketKitError | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;

  const error = record.error;
  if (typeof error === "string" && error !== "") {
    return new NotFoundError(`finnhub: ${error}`, { provider: "finnhub" });
  }
  if (record.s === "no_data") {
    return new NotFoundError("finnhub: no data for the requested range/symbol", {
      provider: "finnhub",
    });
  }
  return null;
}
