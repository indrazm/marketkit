/**
 * @marketkit/twelvedata — type-safe Twelve Data SDK.
 *
 * ```ts
 * import { TwelveData } from "@marketkit/twelvedata";
 *
 * const market = new TwelveData({ apiKey: process.env.TWELVE_DATA_API_KEY! });
 * const { data } = await market.stocks.quote("AAPL");
 * ```
 */

export * from "./client.js";
export * from "./api.js";
export * from "./classify.js";
export * from "./normalize.js";
export * from "./types.js";
export * from "./stocks.js";
export * from "./fundamentals.js";
export * from "./indicators.js";
export * from "./domains.js";

// Re-export the shared core surface users need alongside the client.
export * from "@marketkit/core";
