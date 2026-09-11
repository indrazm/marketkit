/**
 * @marketkit/massive — type-safe Massive (api.massive.com) SDK.
 *
 * ```ts
 * import { Massive } from "@marketkit/massive";
 *
 * const market = new Massive({ apiKey: process.env.MASSIVE_API_KEY! });
 * const { data } = await market.stocks.aggs("AAPL", {
 *   multiplier: 1, timespan: "day", from: "2026-01-01", to: "2026-09-08",
 * });
 * ```
 */

export * from "./client.js";
export * from "./api.js";
export * from "./classify.js";
export * from "./shared.js";
export * from "./types.js";
export * from "./stocks.js";
export * from "./domains.js";

// Re-export the shared core surface users need alongside the client.
export * from "@marketkit/core";
