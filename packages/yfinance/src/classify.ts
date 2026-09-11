/**
 * Yahoo signal classification: chart/quote/quoteSummary/optionChain payloads
 * carry `{error: {code, description}}` (or `quoteResponse.error`) inside HTTP
 * 200. `"Not Found"` maps to NotFoundError; anything else to ProviderError.
 */

import { MarketKitError, NotFoundError, ProviderError } from "@marketkit/core";
import { isRecord } from "./shared.js";

function errorOf(payload: unknown): { code?: string; description?: string } | null {
  if (!isRecord(payload)) return null;
  const direct = isRecord(payload.error) ? payload.error : null;
  if (direct) return direct as { code?: string; description?: string };
  for (const key of ["chart", "quoteResponse", "quoteSummary", "optionChain", "finance"]) {
    const nested = payload[key];
    if (isRecord(nested) && isRecord(nested.error)) {
      return nested.error as { code?: string; description?: string };
    }
  }
  return null;
}

export function classifyYahooPayload(payload: unknown): MarketKitError | null {
  const error = errorOf(payload);
  if (!error) return null;
  const code = typeof error.code === "string" ? error.code : "";
  const description = typeof error.description === "string" ? error.description : "";
  const message = description !== "" ? description : code !== "" ? code : "provider error";
  if (code === "Not Found" || /not found|no data|no results/i.test(`${code} ${description}`)) {
    return new NotFoundError(`yfinance: ${message}`, { provider: "yfinance" });
  }
  return new ProviderError(`yfinance: ${message}`, { provider: "yfinance" });
}
