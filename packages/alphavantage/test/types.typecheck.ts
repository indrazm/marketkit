// Compile-time assertions for the typed `indicators.get` overloads (PRD §16).
// Not executed at runtime; checked via `tsc --noEmit` in CI/`pnpm check`.
import type { AlphaVantage, BbandsPoint, IndicatorPoint, MacdPoint } from "../src/index.js";

declare const market: AlphaVantage;

export async function overloadAssertions(): Promise<void> {
  const macd = await market.indicators.get("macd", { symbol: "AAPL", interval: "1d" });
  const macdPoint: MacdPoint = macd.data[0];

  const bb = await market.indicators.get("bbands", { symbol: "AAPL", interval: "1d", stdDev: 2 });
  const bbPoint: BbandsPoint = bb.data[0];

  const rsi = await market.indicators.get("rsi", { symbol: "AAPL", interval: "1d", period: 14 });
  const rsiPoint: IndicatorPoint = rsi.data[0];

  // Unknown names stay reachable as the union escape hatch.
  const unknown = await market.indicators.get("some_new_indicator", {
    symbol: "AAPL",
    interval: "1d",
  });
  const anyPoint: MacdPoint | BbandsPoint | IndicatorPoint = unknown.data[0];

  void [macdPoint, bbPoint, rsiPoint, anyPoint];
}
