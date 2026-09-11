/**
 * PRD §14: fundamentals domain — OVERVIEW, financial statements, earnings and
 * the CSV calendars.
 */

import { type MarketResponse, ParseError, type RequestOptions } from "@marketkit/core";

import { type AlphaVantageApi, type AlphaVantageMetaFields, envelope, parseMeta } from "./api.js";
import type {
  CorporateAction,
  CorporateSplit,
  CompanyLogo,
  Earnings,
  EarningsCalendarEntry,
  EarningsCalendarOptions,
  EarningsEstimates,
  EarningsReport,
  EtfProfile,
  FinancialReport,
  IpoCalendarEntry,
  ListingStatusEntry,
  ListingStatusOptions,
  OverviewOptions,
  SharesOutstanding,
  Statements,
  StatementsOptions,
} from "./types.js";
import {
  deepNormalize,
  isRecord,
  normalizeKey,
  numeric,
  optionalNumber,
  optionalString,
  parseCsv,
  parseTimestamp,
} from "./normalize.js";

export class FundamentalsNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  /** `OVERVIEW` — company profile; numeric-looking fields are coerced. */
  async company(
    symbolOrOptions: string | OverviewOptions,
    maybeOptions?: RequestOptions,
  ): Promise<MarketResponse<FinancialReport, AlphaVantageMetaFields>> {
    const symbol = typeof symbolOrOptions === "string" ? symbolOrOptions : symbolOrOptions.symbol;
    const options = typeof symbolOrOptions === "string" ? maybeOptions : symbolOrOptions;
    const payload = await this.api.get<Record<string, unknown>>(
      { function: "OVERVIEW", symbol },
      options,
    );
    const data: FinancialReport = {};
    for (const [key, value] of Object.entries(payload)) {
      const normalized = normalizeKey(key);
      data[normalized] =
        typeof value === "string" || typeof value === "number" ? numeric(value) : String(value);
    }
    return envelope(data, parseMeta(payload, symbol));
  }

  /** `INCOME_STATEMENT` / `BALANCE_SHEET` / `CASH_FLOW`. */
  async incomeStatement(
    symbolOrOptions: string | StatementsOptions,
    maybeOptions?: RequestOptions,
  ): Promise<MarketResponse<Statements, AlphaVantageMetaFields>> {
    return this.#statements("INCOME_STATEMENT", symbolOrOptions, maybeOptions);
  }

  async balanceSheet(
    symbolOrOptions: string | StatementsOptions,
    maybeOptions?: RequestOptions,
  ): Promise<MarketResponse<Statements, AlphaVantageMetaFields>> {
    return this.#statements("BALANCE_SHEET", symbolOrOptions, maybeOptions);
  }

  async cashFlow(
    symbolOrOptions: string | StatementsOptions,
    maybeOptions?: RequestOptions,
  ): Promise<MarketResponse<Statements, AlphaVantageMetaFields>> {
    return this.#statements("CASH_FLOW", symbolOrOptions, maybeOptions);
  }

  /** `EARNINGS` — annual + quarterly EPS history. */
  async earnings(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<Earnings, AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "EARNINGS", symbol }, options);
    const data: Earnings = {
      symbol,
      annual: readEarningsRows(payload, "annualEarnings", false),
      quarterly: readEarningsRows(payload, "quarterlyEarnings", true),
    };
    return envelope(data, parseMeta(payload, symbol));
  }

  /** `EARNINGS_CALENDAR` (CSV response). */
  async earningsCalendar(
    options: EarningsCalendarOptions = {},
  ): Promise<MarketResponse<EarningsCalendarEntry[], AlphaVantageMetaFields>> {
    const text = await this.api.text(
      { function: "EARNINGS_CALENDAR", horizon: options.horizon ?? "3month" },
      options,
    );
    const rows = parseCsv(text);
    const data = rows.map((row) => ({
      symbol: row.symbol ?? "",
      name: row.name || undefined,
      reportDate: row.reportDate ?? "",
      currency: row.currency || undefined,
      fiscalDateEnding: row.fiscalDateEnding || undefined,
      EPSestimate: numericOrUndefined(row.EPSestimate),
      reportTime: row.reportTime || undefined,
    }));
    return envelope(data, { provider: "alphavantage", fetchedAt: new Date() });
  }

  /** `IPO_CALENDAR` (CSV response). */
  async ipoCalendar(
    options?: RequestOptions,
  ): Promise<MarketResponse<IpoCalendarEntry[], AlphaVantageMetaFields>> {
    const text = await this.api.text({ function: "IPO_CALENDAR" }, options);
    const data = parseCsv(text).map((row) => ({
      symbol: row.symbol || undefined,
      name: row.name || undefined,
      ipoDate: row.ipoDate ?? "",
      currency: row.currency || undefined,
      priceRange: row.priceRange || undefined,
      shares: numericOrUndefined(row.shares),
      exchange: row.exchange || undefined,
      status: row.status || undefined,
    }));
    return envelope(data, { provider: "alphavantage", fetchedAt: new Date() });
  }

  /** `COMPANY_LOGO`. */
  async logo(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<CompanyLogo, AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "COMPANY_LOGO", symbol }, options);
    const url = (payload as { logo?: string }).logo;
    if (typeof url !== "string" || url === "") {
      throw new ParseError("alphavantage: logo: missing logo url", { field: "logo" });
    }
    return envelope({ symbol, url }, parseMeta(payload, symbol));
  }

  /** `ETF_PROFILE` — profile & holdings for an ETF; keys normalized. */
  async etfProfile(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<EtfProfile, AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "ETF_PROFILE", symbol }, options);
    return envelope(deepNormalize(payload) as EtfProfile, parseMeta(payload, symbol));
  }

  /** `DIVIDENDS` — full dividend event history. */
  async dividends(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<CorporateAction, AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "DIVIDENDS", symbol }, options);
    const rows = (payload as { data?: unknown }).data;
    const events = Array.isArray(rows)
      ? rows.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            amount: Number(r.amount ?? NaN),
            effectiveDate: parseTimestamp(String(r.effective_date ?? r.effectiveDate ?? "")),
          };
        })
      : [];
    return envelope(
      { symbol: (payload as { symbol?: string }).symbol ?? symbol, events },
      parseMeta(payload, symbol),
    );
  }

  /** `SPLITS` — full split event history. */
  async splits(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<CorporateSplit, AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "SPLITS", symbol }, options);
    const rows = (payload as { data?: unknown }).data;
    const events = Array.isArray(rows)
      ? rows.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            ratio: String(r.split_ratio ?? r.splitRatio ?? ""),
            effectiveDate: parseTimestamp(String(r.effective_date ?? r.effectiveDate ?? "")),
          };
        })
      : [];
    return envelope(
      { symbol: (payload as { symbol?: string }).symbol ?? symbol, events },
      parseMeta(payload, symbol),
    );
  }

  /** `SHARES_OUTSTANDING`; payload shape varies, keys normalized. */
  async sharesOutstanding(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<SharesOutstanding, AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "SHARES_OUTSTANDING", symbol }, options);
    return envelope(deepNormalize(payload) as SharesOutstanding, parseMeta(payload, symbol));
  }

  /** `EARNINGS_ESTIMATES`; keys normalized. */
  async earningsEstimates(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<EarningsEstimates, AlphaVantageMetaFields>> {
    const payload = await this.api.get({ function: "EARNINGS_ESTIMATES", symbol }, options);
    return envelope(deepNormalize(payload) as EarningsEstimates, parseMeta(payload, symbol));
  }

  /** `LISTING_STATUS` (CSV) — active or delisted symbols. */
  async listingStatus(
    options: ListingStatusOptions = {},
  ): Promise<MarketResponse<ListingStatusEntry[], AlphaVantageMetaFields>> {
    const text = await this.api.text(
      { function: "LISTING_STATUS", date: options.date, state: options.state },
      options,
    );
    const data = parseCsv(text).map((row) => ({
      symbol: row.symbol ?? "",
      name: row.name ?? "",
      exchange: row.exchange ?? "",
      assetType: row.assetType ?? row.asset_type ?? "",
      ipoDate: row.ipoDate ?? row.ipo_date ?? "",
      delistingDate: row.delistingDate ?? row.delisting_date ?? "",
      status: row.status ?? "",
    }));
    return envelope(data, { provider: "alphavantage", fetchedAt: new Date() });
  }

  async #statements(
    fn: string,
    symbolOrOptions: string | StatementsOptions,
    maybeOptions?: RequestOptions,
  ): Promise<MarketResponse<Statements, AlphaVantageMetaFields>> {
    const symbol = typeof symbolOrOptions === "string" ? symbolOrOptions : symbolOrOptions.symbol;
    const quarter = typeof symbolOrOptions === "string" ? undefined : symbolOrOptions.quarter;
    const options = typeof symbolOrOptions === "string" ? maybeOptions : symbolOrOptions;
    const payload = await this.api.get({ function: fn, symbol }, options);
    const data: Statements = {
      symbol,
      reports: readReportRows(payload, quarter ? "quarterlyreports" : "annualreports"),
    };
    return envelope(data, parseMeta(payload, symbol));
  }
}

function readReportRows(payload: unknown, ...names: string[]): FinancialReport[] {
  const rows = findArray(payload, ...names);
  return rows.map((row) => {
    if (!isRecord(row)) {
      throw new ParseError("alphavantage: expected object row in reports", { field: names[0] });
    }
    const out: FinancialReport = {};
    for (const [key, value] of Object.entries(row)) {
      const normalized = normalizeKey(key);
      if (normalized === "fiscalDateEnding" && typeof value === "string" && value !== "") {
        out.fiscalDateEnding = parseTimestamp(value);
      } else if (typeof value === "string" || typeof value === "number") {
        out[normalized] = numeric(value);
      } else if (value !== null) {
        out[normalized] = String(value);
      }
    }
    return out;
  });
}

function readEarningsRows(payload: unknown, name: string, quarterly: boolean): EarningsReport[] {
  return findArray(payload, name.toLowerCase()).map((row) => {
    if (!isRecord(row)) {
      throw new ParseError(`alphavantage: expected object row in ${name}`, { field: name });
    }
    const fiscal = optionalString(row, "fiscaldateending");
    if (!fiscal) {
      throw new ParseError(`alphavantage: ${name}: missing fiscalDateEnding`, {
        field: "fiscalDateEnding",
      });
    }
    const report: EarningsReport = { fiscalDateEnding: parseTimestamp(fiscal) };
    if (quarterly) {
      const reported = optionalString(row, "reporteddate");
      if (reported) report.reportedDate = parseTimestamp(reported);
    }
    report.reportedEPS = optionalNumber(row, "reportedeps");
    if (quarterly) {
      report.estimatedEPS = optionalNumber(row, "estimatedeps");
      report.surprise = optionalNumber(row, "surprise");
      report.surprisePercentage = optionalNumber(row, "surprisepercentage");
    }
    return report;
  });
}

function findArray(payload: unknown, ...names: string[]): unknown[] {
  if (!isRecord(payload)) return [];
  for (const [key, value] of Object.entries(payload)) {
    if (names.includes(normalizeKey(key).toLowerCase()) && Array.isArray(value)) return value;
  }
  return [];
}

function numericOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
