import type { MarketDataProvider } from "@marketkit/core";

export const twelvedata: MarketDataProvider = {
  name: "twelvedata",
  async getQuote(symbol) {
    throw new Error(`twelvedata: getQuote(${symbol}) not implemented`);
  },
};
