import type { MarketDataProvider } from "@marketkit/core";

export const massive: MarketDataProvider = {
  name: "massive",
  async getQuote(symbol) {
    throw new Error(`massive: getQuote(${symbol}) not implemented`);
  },
};
