import type { MarketDataProvider } from "@marketkit/core";

export const alphavantage: MarketDataProvider = {
  name: "alphavantage",
  async getQuote(symbol) {
    throw new Error(`alphavantage: getQuote(${symbol}) not implemented`);
  },
};
