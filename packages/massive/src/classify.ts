/**
 * Massive signal classification: most errors use HTTP status codes (handled by
 * the transport), but some payloads carry `status: "NOT_FOUND"` / `"ERROR"`.
 */

import { MarketKitError, NotFoundError, ProviderError } from "@marketkit/core";
import { isRecord } from "./shared.js";

export function classifyMassivePayload(payload: unknown): MarketKitError | null {
  if (!isRecord(payload)) return null;
  const status = payload.status;
  if (typeof status !== "string") return null;
  const upper = status.toUpperCase();
  if (upper === "NOT_FOUND") {
    return new NotFoundError("massive: not found", { provider: "massive" });
  }
  if (upper === "ERROR") {
    const message =
      typeof payload.message === "string" && payload.message !== ""
        ? payload.message
        : "provider error";
    return new ProviderError(`massive: ${message}`, { provider: "massive" });
  }
  return null;
}
