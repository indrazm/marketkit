/**
 * PRD §19–§20: options chains and the raw escape hatch.
 */

import { type MarketResponse, ParseError, type RequestOptions } from "@marketkit/core";

import { type AlphaVantageApi, type AlphaVantageMetaFields, envelope, parseMeta } from "./api.js";
import type {
  OptionContract,
  OptionRatio,
  OptionRatioOptions,
  OptionsChainOptions,
  RawRequestOptions,
} from "./types.js";
import { deepNormalize, isRecord, normalizeKey, numeric, parseCsv } from "./normalize.js";

export class OptionsNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  /** Realtime chain; with `date` the historical endpoint is used. */
  /** Realtime or historical put-call ratio for a ticker. */
  async putCallRatio(
    options: OptionRatioOptions,
  ): Promise<MarketResponse<OptionRatio, AlphaVantageMetaFields>> {
    const fn = options.historical ? "HISTORICAL_PUT_CALL_RATIO" : "REALTIME_PUT_CALL_RATIO";
    const payload = await this.api.get(
      { function: fn, symbol: options.symbol, date: options.historical ? options.date : undefined },
      options,
    );
    return envelope(deepNormalize(payload) as OptionRatio, parseMeta(payload, options.symbol));
  }

  /** Realtime or historical volume-to-open-interest ratio for a ticker. */
  async volumeToOpenInterest(
    options: OptionRatioOptions,
  ): Promise<MarketResponse<OptionRatio, AlphaVantageMetaFields>> {
    const fn = options.historical
      ? "HISTORICAL_VOLUME_OPEN_INTEREST_RATIO"
      : "REALTIME_VOLUME_OPEN_INTEREST_RATIO";
    const payload = await this.api.get(
      { function: fn, symbol: options.symbol, date: options.historical ? options.date : undefined },
      options,
    );
    return envelope(deepNormalize(payload) as OptionRatio, parseMeta(payload, options.symbol));
  }

  async chain(
    symbol: string,
    options: OptionsChainOptions = {},
  ): Promise<MarketResponse<OptionContract[], AlphaVantageMetaFields>> {
    const fn = options.date ? "HISTORICAL_OPTIONS" : "REALTIME_OPTIONS";
    const payload = await this.api.get({ function: fn, symbol, date: options.date }, options);
    const rows = findFirstArray(payload);
    const data = rows.map((row) => {
      if (!isRecord(row)) {
        throw new ParseError(
          `alphavantage: options: expected contract object, got ${JSON.stringify(row)}`,
          {
            field: "contracts",
          },
        );
      }
      const out: OptionContract = {};
      for (const [key, value] of Object.entries(row)) {
        const normalized = normalizeKey(key);
        out[normalized] =
          typeof value === "string" || typeof value === "number" ? numeric(value) : undefined;
      }
      return out;
    });
    return envelope(data, parseMeta(payload, symbol));
  }
}

/** Strip `signal` and non-primitives from the raw param bag. */
function toParams(
  params: RawRequestOptions,
): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === "signal" || value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export class RawNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  /** PRD §20: pass-through JSON access to every Alpha Vantage function. */
  async request<T = unknown>(params: RawRequestOptions): Promise<T> {
    const { signal } = params;
    const rest = toParams(params);
    return this.api.get<T>(rest, { signal });
  }

  /** CSV endpoints (calendar-style responses) as parsed rows. */
  async csv(params: RawRequestOptions): Promise<Array<Record<string, string>>> {
    const { signal } = params;
    const rest = toParams(params);
    return parseCsv(await this.api.text(rest, { signal }));
  }

  /** CSV endpoints as the verbatim text body. */
  async csvText(params: RawRequestOptions): Promise<string> {
    const { signal } = params;
    const rest = toParams(params);
    return this.api.text(rest, { signal });
  }
}

export class MarketNamespace {
  constructor(
    private readonly stocks: {
      marketStatus(
        options?: RequestOptions,
      ): Promise<MarketResponse<unknown[], AlphaVantageMetaFields>>;
    },
  ) {}

  /** PRD §13: preferred `market.market.status()` spelling. */
  status(options?: RequestOptions) {
    return this.stocks.marketStatus(options);
  }
}

function findFirstArray(payload: unknown): unknown[] {
  if (isRecord(payload)) {
    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}
