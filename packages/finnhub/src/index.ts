/**
 * @marketkit/finnhub — type-safe Finnhub SDK.
 *
 * ```ts
 * import { Finnhub } from "@marketkit/finnhub";
 *
 * const market = new Finnhub({ apiKey: process.env.FINNHUB_API_KEY! });
 * const { data } = await market.stocks.quote("AAPL");
 * ```
 */

export * from "./client.js";
export * from "./api.js";
export * from "./classify.js";
export * from "./shared.js";
export * from "./types.js";
export * from "./stocks.js";
export * from "./fundamentals.js";
export * from "./news.js";
export * from "./domains.js";

// Re-export the shared core surface users need alongside the client.
export * from "@marketkit/core";
