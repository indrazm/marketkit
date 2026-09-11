/**
 * Commodities (gold/silver, energy, agricultural, global index) and economic
 * indicators. Both return the provider's value-series shape:
 * `{ name, interval, unit, data: [{ date, value }] }`.
 */

import { type MarketResponse, ParseError, type RequestOptions } from "@marketkit/core";

import { type AlphaVantageApi, type AlphaVantageMetaFields, envelope } from "./api.js";
import type {
  CpiOptions,
  CommodityHistoryOptions,
  CommodityName,
  EconomicSeries,
  GdpOptions,
  GoldSilverSpot,
  IntervalOptions,
  TreasuryYieldOptions,
} from "./types.js";
import { parseValueSeries } from "./normalize.js";

const COMMODITY_FUNCTIONS: Record<Exclude<CommodityName, "gold" | "silver">, string> = {
  wti: "WTI",
  brent: "BRENT",
  natural_gas: "NATURAL_GAS",
  copper: "COPPER",
  aluminum: "ALUMINUM",
  wheat: "WHEAT",
  corn: "CORN",
  cotton: "COTTON",
  sugar: "SUGAR",
  coffee: "COFFEE",
  all: "ALL_COMMODITIES",
};

export class CommoditiesNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  /** `GOLD_SILVER_SPOT` — spot price for gold or silver. */
  async spot(
    metal: "gold" | "silver",
    options?: RequestOptions,
  ): Promise<MarketResponse<GoldSilverSpot, AlphaVantageMetaFields>> {
    const payload = await this.api.get(
      { function: "GOLD_SILVER_SPOT", symbol: metal.toUpperCase() },
      options,
    );
    const record = payload as Record<string, unknown>;
    const price = Number(record.price);
    if (!Number.isFinite(price)) {
      throw new ParseError("alphavantage: commodities.spot: missing price", { field: "price" });
    }
    return envelope(
      {
        name: typeof record.name === "string" ? record.name : undefined,
        price,
        updatedAt: typeof record.updated === "string" ? record.updated : undefined,
        unit: typeof record.unit === "string" ? record.unit : undefined,
      },
      { provider: "alphavantage", fetchedAt: new Date() },
    );
  }

  /** Gold/silver close-price history (`daily`/`weekly`/`monthly`). */
  async goldSilverHistory(
    metal: "gold" | "silver",
    interval: "daily" | "weekly" | "monthly",
    options?: RequestOptions,
  ): Promise<MarketResponse<EconomicSeries, AlphaVantageMetaFields>> {
    const payload = await this.api.get(
      { function: "GOLD_SILVER_HISTORY", symbol: metal.toUpperCase(), interval },
      options,
    );
    return envelope(parseValueSeries(payload), {
      provider: "alphavantage",
      fetchedAt: new Date(),
    });
  }

  /** Any commodity series by name (crude oil, gas, metals, grains, softs, index). */
  async history(
    commodity: CommodityName,
    options: CommodityHistoryOptions = {},
  ): Promise<MarketResponse<EconomicSeries, AlphaVantageMetaFields>> {
    if (commodity === "gold" || commodity === "silver") {
      return this.goldSilverHistory(
        commodity,
        (options.interval as "daily" | "weekly" | "monthly") ?? "monthly",
        options,
      );
    }
    const payload = await this.api.get(
      { function: COMMODITY_FUNCTIONS[commodity], interval: options.interval },
      options,
    );
    return envelope(parseValueSeries(payload), {
      provider: "alphavantage",
      fetchedAt: new Date(),
    });
  }
}

export class EconomyNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  private async series(
    fn: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: RequestOptions,
  ): Promise<MarketResponse<EconomicSeries, AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: fn, ...params }, options);
    return envelope(parseValueSeries(payload), {
      provider: "alphavantage",
      fetchedAt: new Date(),
    });
  }

  realGdp(options: GdpOptions = {}) {
    return this.series("REAL_GDP", { interval: options.interval ?? "annual" });
  }

  realGdpPerCapita(options?: RequestOptions) {
    return this.series("REAL_GDP_PER_CAPITA", {}, options);
  }

  treasuryYield(options: TreasuryYieldOptions = {}) {
    return this.series("TREASURY_YIELD", {
      interval: options.interval ?? "monthly",
      maturity: options.maturity ?? "10year",
    });
  }

  federalFundsRate(options: IntervalOptions = {}) {
    return this.series("FEDERAL_FUNDS_RATE", { interval: options.interval ?? "monthly" });
  }

  cpi(options: CpiOptions = {}) {
    return this.series("CPI", { interval: options.interval ?? "monthly" });
  }

  inflation(options?: RequestOptions) {
    return this.series("INFLATION", {}, options);
  }

  retailSales(options?: RequestOptions) {
    return this.series("RETAIL_SALES", {}, options);
  }

  durableGoodsOrders(options?: RequestOptions) {
    return this.series("DURABLES", {}, options);
  }

  unemployment(options?: RequestOptions) {
    return this.series("UNEMPLOYMENT", {}, options);
  }

  nonfarmPayroll(options?: RequestOptions) {
    return this.series("NONFARM_PAYROLL", {}, options);
  }
}
