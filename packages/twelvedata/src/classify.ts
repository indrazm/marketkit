/**
 * PRD §22 equivalent: Twelve Data signals API-level failure inside HTTP 200
 * payloads: `{ "code": <number>, "message": "...", "status": "error" }` (and
 * plan-limit errors with code 429). HTTP-level failures are still handled by
 * the transport.
 */

import {
  AuthenticationError,
  InvalidRequestError,
  MarketKitError,
  NotFoundError,
  RateLimitError,
  ProviderError,
} from "@marketkit/core";

export function classifyTwelveDataPayload(payload: unknown): MarketKitError | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record.status !== "error") return null;

  const message =
    typeof record.message === "string" && record.message !== ""
      ? record.message
      : "unknown provider error";
  const code = typeof record.code === "number" ? record.code : undefined;

  const text = message.toLowerCase();
  if (
    code === 429 ||
    text.includes("run out") ||
    text.includes("limit") ||
    text.includes("credits")
  ) {
    return new RateLimitError(`twelvedata: ${message}`, {
      provider: "twelvedata",
      code: "rate_limit",
    });
  }
  if (
    code === 401 ||
    code === 403 ||
    text.includes("apikey") ||
    text.includes("api key") ||
    text.includes("plan")
  ) {
    return new AuthenticationError(`twelvedata: ${message}`, {
      provider: "twelvedata",
      code: code === 403 ? "forbidden" : "authentication",
    });
  }
  if (text.includes("not found") || text.includes("no data") || text.includes("unknown symbol")) {
    return new NotFoundError(`twelvedata: ${message}`, { provider: "twelvedata" });
  }
  if (code !== undefined && code >= 500) {
    return new ProviderError(`twelvedata: ${message}`, { provider: "twelvedata" });
  }
  return new InvalidRequestError(`twelvedata: ${message}`, {
    provider: "twelvedata",
    code: "invalid_request",
  });
}
