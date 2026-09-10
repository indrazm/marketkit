/**
 * Fundamentals domain: profile, metrics, financial statements, earnings
 * surprises & estimates, recommendations, price target, upgrades/downgrades,
 * executives, ownership, insider activity, ESG, transcripts, and the rest of
 * the `/stock/*` long tail via typed passthroughs.
 */

import { MarketResponse, RequestOptions } from "@marketkit/core";

import { envelope, FinnhubApi, meta } from "./api.js";
import type { EarningsSurprise, LooseData, PriceTarget, Profile, Recommendation } from "./types.js";
import { deepNumeric } from "./shared.js";

export class FundamentalsNamespace {
  constructor(private readonly api: FinnhubApi) {}

  /** `/stock/profile2` — company profile; snake_case keys mapped. */
  async profile(symbol: string, options?: RequestOptions): Promise<MarketResponse<Profile, Meta>> {
    const payload = await this.api.get("stock/profile2", { symbol }, options);
    const row = deepNumeric(payload) as Record<string, unknown>;
    const data: Profile = {
      symbol: asString(row.symbol ?? row.ticker),
      name: asString(row.name),
      country: asString(row.country),
      currency: asString(row.currency),
      exchange: asString(row.exchange),
      micCode: asString(row.mic_code ?? row.micCode),
      ipoDate: asString(row.ipo_date ?? row.ipoDate),
      marketCapitalization: asNumber(row.marketCapitalization ?? row.market_capitalization),
      shareOutstanding: asNumber(row.shareOutstanding ?? row.share_outstanding),
      logo: asString(row.logo),
      weburl: asString(row.weburl),
      phone: asString(row.phone),
      industry: asString(row.finnhubindustry ?? row.industry),
      finnhubIndustry: asString(row.finnhubindustry),
      ticker: asString(row.ticker),
    };
    return envelope(data, meta());
  }

  /** `/stock/metric` — basic financials by metric type (`all` or a group). */
  async metric(
    symbol: string,
    metricType:
      | "all"
      | "price"
      | "valuation"
      | "margin"
      | "growth"
      | "perShare"
      | "management"
      | "financialStrength"
      | "volatility"
      | "ownership" = "all",
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get("stock/metric", { symbol, metric: metricType }, options);
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  /** `/stock/financials` — income statement / balance sheet / cash flow. */
  async financials(
    symbol: string,
    statement: "ic" | "bs" | "cf",
    options: { freq?: "annual" | "quarterly" } & RequestOptions = {},
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get(
      "stock/financials",
      { symbol, statement, freq: options.freq ?? "annual" },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  /** `/stock/financials-reported` — as-reported filings. */
  async financialsReported(
    options: {
      symbol?: string;
      cik?: string;
      freq?: "annual" | "quarterly" | " inception";
    } & RequestOptions,
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get(
      "stock/financials-reported",
      { symbol: options.symbol, cik: options.cik, freq: options.freq },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  /** `/stock/earnings` — EPS surprises. */
  async earningsSurprises(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<EarningsSurprise[], Meta>> {
    const payload = await this.api.get("stock/earnings", { symbol }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(
      rows.map((row) => deepNumeric(row) as EarningsSurprise),
      meta(),
    );
  }

  /** `/stock/recommendation` — analyst recommendation trends. */
  async recommendations(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Recommendation[], Meta>> {
    const payload = await this.api.get("stock/recommendation", { symbol }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(
      rows.map((row) => deepNumeric(row) as Recommendation),
      meta(),
    );
  }

  /** `/stock/price-target`. */
  async priceTarget(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<PriceTarget, Meta>> {
    const payload = await this.api.get("stock/price-target", { symbol }, options);
    return envelope(deepNumeric(payload) as PriceTarget, meta());
  }

  /** `/stock/upgrade-downgrade` — firm-by-firm rating changes. */
  async upgradeDowngrade(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("stock/upgrade-downgrade", { symbol }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(
      rows.map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }

  /** `/stock/executive`. */
  async executives(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("stock/executive", { symbol }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(
      rows.map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }

  /** `/stock/ownership` — 13F ownership for a symbol. */
  async ownership(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("stock/ownership", { symbol }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(
      rows.map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }

  /** `/stock/fund-ownership`. */
  async fundOwnership(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("stock/fund-ownership", { symbol }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(
      rows.map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }

  /** `/stock/insider-transactions`. */
  async insiderTransactions(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get("stock/insider-transactions", { symbol }, options);
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  /** `/stock/insider-sentiment`. */
  async insiderSentiment(
    symbol: string,
    options: { from: string; to: string } & RequestOptions,
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get(
      "stock/insider-sentiment",
      { symbol, from: options.from, to: options.to },
      options,
    );
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  /** `/stock/esg`. */
  async esg(symbol: string, options?: RequestOptions): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get("stock/esg", { symbol }, options);
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  /** `/stock/similarity-index`. */
  async similarityIndex(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get("stock/similarity-index", { symbol }, options);
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  /** `/stock/transcripts/list`. */
  async transcripts(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("stock/transcripts/list", { symbol }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(
      rows.map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }

  /** `/stock/transcripts?id=...`. */
  async transcript(id: number, options?: RequestOptions): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get("stock/transcripts", { id }, options);
    return envelope(deepNumeric(payload) as LooseData, meta());
  }

  /** Estimates family: `eps-estimate`, `revenue-estimate`, `ebit-estimate`, etc. */
  estimate(
    kind:
      | "eps"
      | "revenue"
      | "ebit"
      | "ebitda"
      | "fcf"
      | "netIncome"
      | "pretaxIncome"
      | "grossIncome"
      | "ocf"
      | "capex"
      | "dps",
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, Meta>> {
    const endpoint: Record<string, string> = {
      eps: "stock/eps-estimate",
      revenue: "stock/revenue-estimate",
      ebit: "stock/ebit-estimate",
      ebitda: "stock/ebitda-estimate",
      fcf: "stock/fcf-estimate",
      netIncome: "stock/net-income-estimate",
      pretaxIncome: "stock/pretax-income-estimate",
      grossIncome: "stock/gross-income-estimate",
      ocf: "stock/ocf-estimate",
      capex: "stock/capex-estimate",
      dps: "stock/dps-estimate",
    };
    return this.#loose(endpoint[kind], { symbol }, options);
  }

  /** Other `/stock/*` endpoints not wrapped above. */
  async get<T = LooseData>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: RequestOptions,
  ): Promise<MarketResponse<T, Meta>> {
    const payload = await this.api.get(
      `stock/${endpoint.replace(/^stock\//, "")}`,
      params,
      options,
    );
    return envelope(deepNumeric(payload) as T, meta());
  }

  async #loose(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined>,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, Meta>> {
    const payload = await this.api.get(`stock/${endpoint}`, params, options);
    return envelope(deepNumeric(payload) as LooseData, meta());
  }
}

type Meta = { provider: "finnhub"; fetchedAt: Date };

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
