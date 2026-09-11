/**
 * @marketkit/yfinance — type-safe Yahoo Finance SDK in the MarketKit style.
 *
 * ```ts
 * import { YFinance } from "@marketkit/yfinance";
 *
 * const market = new YFinance({});
 * const { data } = await market.stocks.history("AAPL", {
 *   interval: "1d", range: "1mo",
 * });
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
