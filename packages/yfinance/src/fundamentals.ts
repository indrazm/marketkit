/**
 * Fundamentals domain: `v10/finance/quoteSummary/{symbol}?modules=...`
 * (`Ticker.get_info`, financials, earnings, holders, calendar parity).
 */

import type { MarketResponse, RequestOptions } from "@marketkit/core";

import { envelope, type YahooApi } from "./api.js";
import { isRecord, rawDate, rawValue } from "./shared.js";
import type { LooseData, QuoteSummaryModule, YahooMeta } from "./types.js";

function meta(): YahooMeta {
  return { provider: "yfinance", fetchedAt: new Date() };
}

type ModuleOptions = RequestOptions & { lang?: string; region?: string };

export class FundamentalsNamespace {
  constructor(private readonly api: YahooApi) {}

  /**
   * Raw module fetch — any `quoteSummary` module combination, keys verbatim
   * with `{raw, fmt}` objects preserved under each field for fidelity.
   */
  async modules(
    symbol: string,
    modules: QuoteSummaryModule[],
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData, YahooMeta>> {
    const payload = await this.api.getQuery1<unknown>(
      `v10/finance/quoteSummary/${encodeURIComponent(symbol)}`,
      { modules: modules.join(","), lang: options?.lang, region: options?.region },
      options,
    );
    const summary = isRecord(payload) ? payload.quoteSummary : undefined;
    const rows = isRecord(summary) ? summary.result : undefined;
    const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : {};
    return envelope((isRecord(first) ? first : {}) as LooseData, meta());
  }

  /** Profile (`assetProfile` + `summaryProfile`). */
  async profile(
    symbol: string,
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData, YahooMeta>> {
    return this.modules(symbol, ["assetProfile", "summaryProfile"], options);
  }

  /** Key statistics (`defaultKeyStatistics` + `price`). */
  async statistics(
    symbol: string,
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData, YahooMeta>> {
    const { data, meta: m } = await this.modules(
      symbol,
      ["defaultKeyStatistics", "price", "summaryDetail"],
      options,
    );
    return {
      data: {
        ...data,
        marketCap: rawValue((data.price as Record<string, unknown> | undefined)?.marketCap),
        trailingPE: rawValue(
          (data.summaryDetail as Record<string, unknown> | undefined)?.trailingPE,
        ),
        forwardPE: rawValue((data.summaryDetail as Record<string, unknown> | undefined)?.forwardPE),
        dividendYield: rawValue(
          (data.summaryDetail as Record<string, unknown> | undefined)?.dividendYield,
        ),
        beta: rawValue((data.defaultKeyStatistics as Record<string, unknown> | undefined)?.beta),
      } as LooseData,
      meta: m,
    };
  }

  /** Income statements (annual + quarterly). */
  async incomeStatements(
    symbol: string,
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData[], YahooMeta>> {
    return this.statementRows(
      symbol,
      ["incomeStatementHistory", "incomeStatementHistoryQuarterly"],
      options,
    );
  }

  /** Balance sheets (annual + quarterly). */
  async balanceSheets(
    symbol: string,
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData[], YahooMeta>> {
    return this.statementRows(
      symbol,
      ["balanceSheetHistory", "balanceSheetHistoryQuarterly"],
      options,
    );
  }

  /** Cash-flow statements (annual + quarterly). */
  async cashflowStatements(
    symbol: string,
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData[], YahooMeta>> {
    return this.statementRows(
      symbol,
      ["cashflowStatementHistory", "cashflowStatementHistoryQuarterly"],
      options,
    );
  }

  /** Earnings history + trend + estimates. */
  async earnings(
    symbol: string,
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData, YahooMeta>> {
    return this.modules(symbol, ["earningsHistory", "earningsTrend", "earnings"], options);
  }

  /** Holders: majors, institutions, funds, insiders. */
  async holders(
    symbol: string,
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData, YahooMeta>> {
    return this.modules(
      symbol,
      [
        "majorHoldersBreakdown",
        "institutionOwnership",
        "fundOwnership",
        "insiderHolders",
        "insiderTransactions",
        "netSharePurchaseActivity",
      ],
      options,
    );
  }

  /** Calendar events (earnings date, ex-dividend date). */
  async calendar(
    symbol: string,
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData, YahooMeta>> {
    const { data, meta: m } = await this.modules(symbol, ["calendarEvents"], options);
    const events = (data.calendarEvents ?? {}) as Record<string, unknown>;
    return {
      data: {
        ...data,
        earningsDate:
          rawDate(events.earningsDate) ??
          (Array.isArray(events.earningsDate)
            ? rawDate((events.earningsDate as unknown[])[0])
            : undefined),
        exDividendDate: rawDate(events.exDividendDate),
        dividendDate: rawDate(events.dividendDate),
      } as LooseData,
      meta: m,
    };
  }

  /** Analyst recommendations, price targets, upgrades/downgrades. */
  async analysis(
    symbol: string,
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData, YahooMeta>> {
    return this.modules(
      symbol,
      ["recommendationTrend", "priceTarget", "upgradeDowngradeHistory"],
      options,
    );
  }

  private async statementRows(
    symbol: string,
    modules: QuoteSummaryModule[],
    options?: ModuleOptions,
  ): Promise<MarketResponse<LooseData[], YahooMeta>> {
    const { data } = await this.modules(symbol, modules, options);
    const rows: LooseData[] = [];
    for (const name of modules) {
      const module = data[name] as Record<string, unknown> | undefined;
      const statements = module !== undefined ? module[statementKey(name)] : undefined;
      if (!Array.isArray(statements)) continue;
      const timeframe = name.endsWith("Quarterly") ? "quarterly" : "annual";
      for (const row of statements) {
        if (!isRecord(row)) continue;
        rows.push({ timeframe, endDate: rawDate(row.endDate), ...flattenRaw(row) });
      }
    }
    return { data: rows, meta: meta() };
  }
}

function statementKey(module: string): string {
  if (module.startsWith("incomeStatement")) return "incomeStatementHistory";
  if (module.startsWith("balanceSheet")) return "balanceSheetHistory";
  return "cashflowStatements";
}

/** `{raw, fmt}` fields → raw numbers (dates handled by callers). */
function flattenRaw(row: Record<string, unknown>): LooseData {
  const out: LooseData = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "endDate" || key === "maxAge") continue;
    out[key] = isRecord(value) && "raw" in value ? value.raw : value;
  }
  return out;
}
