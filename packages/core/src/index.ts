export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  /** Epoch milliseconds. */
  timestamp: number;
}

export interface MarketDataProvider {
  readonly name: string;
  getQuote(symbol: string): Promise<Quote>;
}
