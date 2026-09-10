/**
 * Fundamentals domain: profile, key executives, statements (income, balance
 * sheet, cash flow), earnings, dividends, splits, statistics, market cap,
 * analyst coverage (ratings, price target, recommendations, estimates), ETF
 * info, holders (institutional, fund, direct), insider transactions, press
 * releases, EDGAR filings, and logo.
 */

import { type MarketResponse, type RequestOptions } from "@marketkit/core";

import { type TwelveDataApi } from "./api.js";
import type {
  CompanyLogo,
  DividendEvent,
  Dividends,
  Earnings,
  EarningsEvent,
  LooseData,
  Profile,
  Splits,
  SplitEvent,
  StatementReport,
  Statements,
  StatementsOptions,
} from "./types.js";
import {
  deepNumeric,
  envelope,
  normalizeRow,
  optionalNumber,
  optionalString,
  parseMeta,
  parseTimestamp,
  strictNumber,
} from "./normalize.js";

export class FundamentalsNamespace {
  constructor(private readonly api: TwelveDataApi) {}

  /** `profile`. */
  async profile(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Profile, LooseMeta>> {
    const payload = await this.api.get("profile", { symbol }, options);
    return envelope(normalizeRow(payload) as Profile, parseMeta(payload, symbol));
  }

  /** `logo`. */
  async logo(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<CompanyLogo, LooseMeta>> {
    const payload = await this.api.get("logo", { symbol }, options);
    const row = payload as Record<string, unknown>;
    return envelope(
      {
        symbol,
        url: optionalString(row.logo),
        background: optionalString(row.background),
        foreground: optionalString(row.foreground),
      },
      parseMeta(payload, symbol),
    );
  }

  /** `key_executives`. */
  async keyExecutives(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, LooseMeta>> {
    const payload = await this.api.get("key_executives", { symbol }, options);
    return envelope(payload as LooseData, parseMeta(payload, symbol));
  }

  /** `income_statement` / `balance_sheet` / `cash_flow`. */
  async incomeStatement(
    options: StatementsOptions,
  ): Promise<MarketResponse<Statements, LooseMeta>> {
    return this.#statement("income_statement", options);
  }

  async balanceSheet(options: StatementsOptions): Promise<MarketResponse<Statements, LooseMeta>> {
    return this.#statement("balance_sheet", options);
  }

  async cashFlow(options: StatementsOptions): Promise<MarketResponse<Statements, LooseMeta>> {
    return this.#statement("cash_flow", options);
  }

  /** `earnings` — EPS history. */
  async earnings(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Earnings, LooseMeta>> {
    const payload = await this.api.get("earnings", { symbol }, options);
    const rows = (payload as { earnings?: unknown }).earnings;
    const list = Array.isArray(rows)
      ? rows.map((row) => {
          const r = normalizeRow(row);
          const event: EarningsEvent = {};
          const date = optionalString(r.date);
          if (date) event.date = parseTimestamp(date);
          event.epsActual = optionalNumber(r.eps_actual);
          event.epsEstimate = optionalNumber(r.eps_estimate);
          event.difference = optionalNumber(r.difference);
          event.surprisePercent = optionalNumber(r.surprise_percent);
          event.time = optionalString(r.time);
          event.beforeAfterMarket = optionalString(r.before_after_market);
          return event;
        })
      : [];
    return envelope({ symbol, earnings: list }, parseMeta(payload, symbol));
  }

  /** `dividends` — dividend history. */
  async dividends(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Dividends, LooseMeta>> {
    const payload = await this.api.get("dividends", { symbol }, options);
    const rows = (payload as { dividends?: unknown }).dividends;
    const list = Array.isArray(rows)
      ? rows.map((row) => {
          const r = normalizeRow(row);
          const event: DividendEvent = {
            amount: strictNumber(r.amount, "amount"),
          };
          const exDate = optionalString(r.ex_date);
          if (exDate) event.exDate = parseTimestamp(exDate);
          const paymentDate = optionalString(r.payment_date);
          if (paymentDate) event.paymentDate = parseTimestamp(paymentDate);
          const recordDate = optionalString(r.record_date);
          if (recordDate) event.recordDate = parseTimestamp(recordDate);
          const declaredDate = optionalString(r.declared_date);
          if (declaredDate) event.declaredDate = parseTimestamp(declaredDate);
          return event;
        })
      : [];
    return envelope({ symbol, dividends: list }, parseMeta(payload, symbol));
  }

  /** `splits` — split history. */
  async splits(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Splits, LooseMeta>> {
    const payload = await this.api.get("splits", { symbol }, options);
    const rows = (payload as { splits?: unknown }).splits;
    const list = Array.isArray(rows)
      ? rows.map((row) => {
          const r = normalizeRow(row);
          const event: SplitEvent = {
            ratio: String(r.split_ratio ?? ""),
          };
          const date = optionalString(r.date);
          if (date) event.date = parseTimestamp(date);
          event.splitTo = optionalNumber(r.split_to);
          event.splitFrom = optionalNumber(r.split_from);
          return event;
        })
      : [];
    return envelope({ symbol, splits: list }, parseMeta(payload, symbol));
  }

  /** `statistics` — valuation, per-share and shareholder stats. */
  async statistics(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, LooseMeta>> {
    const payload = await this.api.get("statistics", { symbol }, options);
    return envelope(deepNumeric(payload) as LooseData, parseMeta(payload, symbol));
  }

  /** `market_cap`. */
  async marketCap(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<number, LooseMeta>> {
    const payload = await this.api.get("market_cap", { symbol }, options);
    return envelope(
      strictNumber((payload as { market_cap?: unknown }).market_cap, "market_cap"),
      parseMeta(payload, symbol),
    );
  }

  // ── Analyst coverage ──────────────────────────────────────────────────────

  analystRatings(symbol: string, options?: RequestOptions) {
    return this.#loose("analyst_ratings", symbol, options);
  }

  priceTarget(symbol: string, options?: RequestOptions) {
    return this.#loose("price_target", symbol, options);
  }

  recommendations(symbol: string, options?: RequestOptions) {
    return this.#loose("recommendations", symbol, options);
  }

  earningsEstimate(symbol: string, options?: RequestOptions) {
    return this.#loose("earnings_estimate", symbol, options);
  }

  revenueEstimate(symbol: string, options?: RequestOptions) {
    return this.#loose("revenue_estimate", symbol, options);
  }

  epsRevisions(symbol: string, options?: RequestOptions) {
    return this.#loose("eps_revisions", symbol, options);
  }

  epsTrend(symbol: string, options?: RequestOptions) {
    return this.#loose("eps_trend", symbol, options);
  }

  growthEstimates(symbol: string, options?: RequestOptions) {
    return this.#loose("growth_estimates", symbol, options);
  }

  // ── Ownership & filings ───────────────────────────────────────────────────

  insiderTransactions(symbol: string, options?: RequestOptions) {
    return this.#loose("insider_transactions", symbol, options);
  }

  institutionalHolders(symbol: string, options?: RequestOptions) {
    return this.#loose("institutional_holders", symbol, options);
  }

  fundHolders(symbol: string, options?: RequestOptions) {
    return this.#loose("fund_holders", symbol, options);
  }

  directHolders(symbol: string, options?: RequestOptions) {
    return this.#loose("direct_holders", symbol, options);
  }

  edgarFilings(symbol: string, options?: RequestOptions) {
    return this.#loose("edgar_filings", symbol, options);
  }

  pressReleases(symbol: string, options?: RequestOptions) {
    return this.#loose("press_releases", symbol, options);
  }

  etfInfo(symbol: string, options?: RequestOptions) {
    return this.#loose("etf", symbol, options);
  }

  taxInfo(symbol: string, options?: RequestOptions) {
    return this.#loose("tax_info", symbol, options);
  }

  sanctions(symbol: string, options?: RequestOptions) {
    return this.#loose("sanctions", symbol, options);
  }

  async #loose(
    endpoint: string,
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData, LooseMeta>> {
    const payload = await this.api.get(endpoint, { symbol }, options);
    return envelope(deepNumeric(payload) as LooseData, parseMeta(payload, symbol));
  }

  async #statement(
    endpoint: string,
    options: StatementsOptions,
  ): Promise<MarketResponse<Statements, LooseMeta>> {
    const { symbol, period = "quarter" } = options;
    const payload = await this.api.get(endpoint, { symbol, period }, options);
    const key = endpoint; // e.g. payload.income_statement
    const rows = (payload as Record<string, unknown>)[key];
    const reports: StatementReport[] = Array.isArray(rows)
      ? rows.map((row) => {
          const r = normalizeRow(row);
          const report: StatementReport = {};
          for (const [field, value] of Object.entries(r)) {
            if (field === "fiscal_date" && typeof value === "string") {
              report.fiscalDate = parseTimestamp(value);
            } else if (typeof value === "string" || typeof value === "number") {
              report[field] = value;
            }
          }
          return report;
        })
      : [];
    return envelope({ symbol, reports }, parseMeta(payload, symbol));
  }
}

type LooseMeta = ReturnType<typeof parseMeta>;
