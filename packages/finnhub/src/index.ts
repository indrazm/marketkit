import type { MarketDataProvider } from "@marketkit/core";

export const finnhub: MarketDataProvider = {
  name: "finnhub",
  async getQuote(symbol) {
    throw new Error(`finnhub: getQuote(${symbol}) not implemented`);
  },
};
