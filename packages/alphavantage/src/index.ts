/**
 * @marketkit/alphavantage — type-safe Alpha Vantage SDK (PRD §1/§5/§6).
 *
 * ```ts
 * import { AlphaVantage } from "@marketkit/alphavantage";
 *
 * const market = new AlphaVantage({ apiKey: process.env.ALPHA_VANTAGE_API_KEY! });
 * const { data } = await market.stocks.quote("AAPL");
 * ```
 */

export * from "./client.js";
export * from "./types.js";
export * from "./api.js";
export * from "./classify.js";
export * from "./normalize.js";

// Re-export the shared core surface users need alongside the client.
export * from "@marketkit/core";
