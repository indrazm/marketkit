/**
 * PRD §16: indicators use a single `get(name, ...)` mechanism; popular helpers
 * (rsi/macd/sma/...) delegate to it instead of mirroring every AV function.
 */

import { type MarketResponse, ParseError } from "@marketkit/core";

import { type AlphaVantageApi, type AlphaVantageMetaFields, envelope, parseMeta } from "./api.js";
import type {
  AroonPoint,
  BbandsOptions,
  BbandsPoint,
  HtPhasorPoint,
  HtSinePoint,
  IndicatorIntervalOptions,
  IndicatorName,
  IndicatorPoint,
  KnownIndicatorName,
  MacdOptions,
  MacdPoint,
  StochPoint,
  StockInterval,
} from "./types.js";
import { describe, isRecord, normalizeKey, optionalNumber, parseTimestamp } from "./normalize.js";

const INTERVAL_MAP: Record<StockInterval, string> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "60m": "60min",
  "1d": "daily",
  "1w": "weekly",
  "1mo": "monthly",
};

export class IndicatorsNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  /**
   * PRD §16: typed overloads — the result type discriminates on the name
   * literal: `get("macd", …)` returns `MacdPoint[]`, `get("bbands", …)`
   * returns `BbandsPoint[]`, every other known indicator returns
   * `IndicatorPoint[]`. Unknown names (escape hatch) return the union.
   */
  async get(
    name: "macd",
    options: MacdOptions,
  ): Promise<MarketResponse<MacdPoint[], AlphaVantageMetaFields>>;
  async get(
    name: "bbands",
    options: BbandsOptions,
  ): Promise<MarketResponse<BbandsPoint[], AlphaVantageMetaFields>>;
  async get(
    name: KnownIndicatorName,
    options: IndicatorIntervalOptions,
  ): Promise<MarketResponse<IndicatorPoint[], AlphaVantageMetaFields>>;
  async get(
    name: IndicatorName,
    options: IndicatorIntervalOptions,
  ): Promise<
    MarketResponse<IndicatorPoint[] | MacdPoint[] | BbandsPoint[], AlphaVantageMetaFields>
  >;
  async get(
    name: IndicatorName,
    options: IndicatorIntervalOptions,
  ): Promise<
    MarketResponse<
      | IndicatorPoint[]
      | MacdPoint[]
      | BbandsPoint[]
      | StochPoint[]
      | AroonPoint[]
      | HtSinePoint[]
      | HtPhasorPoint[],
      AlphaVantageMetaFields
    >
  > {
    const lower = name.toLowerCase();
    const params: Record<string, string | number | undefined> = {
      function: lower.toUpperCase(),
      symbol: options.symbol,
      interval: INTERVAL_MAP[options.interval],
      series_type: options.seriesType ?? "close",
      ...flatten(options.params),
    };
    if (options.period !== undefined) params.time_period = options.period;
    if (lower === "macd") {
      params.fastperiod = asOption(options as MacdOptions).fastPeriod ?? 12;
      params.slowperiod = asOption(options as MacdOptions).slowPeriod ?? 26;
      params.signalperiod = asOption(options as MacdOptions).signalPeriod ?? 9;
    }
    if (lower === "bbands") {
      const bb = options as BbandsOptions;
      params.time_period = bb.period ?? 20;
      params.stddevperiods = bb.stdDev ?? 2;
      if (bb.matype !== undefined) params.matype = bb.matype;
    }
    const payload = await this.api.get(params, options);
    const series = findTechnicalSection(payload);
    if (!series) {
      throw new ParseError(
        `alphavantage: indicators.get(${name}): no "Technical Analysis" section in response`,
        { field: "Technical Analysis" },
      );
    }
    const meta = parseMeta(payload, options.symbol);
    if (lower === "macd") {
      return envelope(parseMacd(series), meta);
    }
    if (lower === "bbands") {
      return envelope(parseBbands(series), meta);
    }
    if (lower === "stoch" || lower === "stochf") {
      return envelope(parseStoch(series), meta);
    }
    if (lower === "aroon") {
      return envelope(parseAroon(series), meta);
    }
    if (lower === "ht_sine") {
      return envelope(parseHtSine(series), meta);
    }
    if (lower === "ht_phasor") {
      return envelope(parseHtPhasor(series), meta);
    }
    return envelope(parseSingleSeries(series), meta);
  }

  rsi(options: IndicatorIntervalOptions) {
    return this.get("rsi", options);
  }

  macd(options: MacdOptions) {
    return this.get("macd", options);
  }

  sma(options: IndicatorIntervalOptions) {
    return this.get("sma", options);
  }

  ema(options: IndicatorIntervalOptions) {
    return this.get("ema", options);
  }

  bbands(options: BbandsOptions) {
    return this.get("bbands", options);
  }

  atr(options: IndicatorIntervalOptions) {
    return this.get("atr", options);
  }

  adx(options: IndicatorIntervalOptions) {
    return this.get("adx", options);
  }

  stoch(options: IndicatorIntervalOptions) {
    return this.get("stoch", options);
  }

  stochf(options: IndicatorIntervalOptions) {
    return this.get("stochf", options);
  }

  aroon(options: IndicatorIntervalOptions) {
    return this.get("aroon", options);
  }

  htSine(options: IndicatorIntervalOptions) {
    return this.get("ht_sine", options);
  }

  htPhasor(options: IndicatorIntervalOptions) {
    return this.get("ht_phasor", options);
  }
}

function asOption(options: MacdOptions): MacdOptions {
  return options;
}

function flatten(params: Record<string, string | number> | undefined) {
  return params ?? {};
}

function findTechnicalSection(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload)) return undefined;
  // "Technical Analysis: RSI" can be top-level or nested under a meta wrapper.
  for (const [key, value] of Object.entries(payload)) {
    if (normalizeKey(key).toLowerCase().startsWith("technicalanalysis") && isRecord(value)) {
      return value;
    }
  }
  for (const value of Object.values(payload)) {
    if (!isRecord(value)) continue;
    for (const [key, nested] of Object.entries(value)) {
      if (normalizeKey(key).toLowerCase().startsWith("technicalanalysis") && isRecord(nested)) {
        return nested;
      }
    }
  }
  return undefined;
}

/** Generic single-value series ("RSI": "31.2"). */
function parseSingleSeries(series: Record<string, unknown>): IndicatorPoint[] {
  return entriesSorted(series).map(([timestamp, row]) => {
    if (!isRecord(row)) {
      throw new ParseError(`alphavantage: indicator row expected object, got ${describe(row)}`, {
        field: "Technical Analysis",
      });
    }
    const key = Object.keys(row)[0];
    const value =
      key === undefined ? undefined : optionalNumber(row, normalizeKey(key).toLowerCase());
    if (value === undefined) {
      throw new ParseError("alphavantage: indicator row has no numeric value", {
        field: "Technical Analysis",
      });
    }
    return { timestamp: parseTimestamp(timestamp), value };
  });
}

function parseMacd(series: Record<string, unknown>): MacdPoint[] {
  return entriesSorted(series).map(([timestamp, row]) => {
    if (!isRecord(row)) {
      throw new ParseError(`alphavantage: macd row expected object, got ${describe(row)}`, {
        field: "Technical Analysis",
      });
    }
    return {
      timestamp: parseTimestamp(timestamp),
      macd: optionalNumber(row, "macd") ?? 0,
      signal: optionalNumber(row, "macdsignal", "signal") ?? 0,
      histogram: optionalNumber(row, "macdhist", "hist") ?? 0,
    };
  });
}

function parseBbands(series: Record<string, unknown>): BbandsPoint[] {
  return entriesSorted(series).map(([timestamp, row]) => {
    if (!isRecord(row)) {
      throw new ParseError(`alphavantage: bbands row expected object, got ${describe(row)}`, {
        field: "Technical Analysis",
      });
    }
    return {
      timestamp: parseTimestamp(timestamp),
      upper: optionalNumber(row, "realupperband", "upper") ?? 0,
      middle: optionalNumber(row, "realmiddleband", "middle") ?? 0,
      lower: optionalNumber(row, "reallowerband", "lower") ?? 0,
    };
  });
}

function parseStoch(series: Record<string, unknown>): StochPoint[] {
  return entriesSorted(series).map(([timestamp, row]) => {
    if (!isRecord(row)) {
      throw new ParseError(`alphavantage: stoch row expected object, got ${describe(row)}`, {
        field: "Technical Analysis",
      });
    }
    return {
      timestamp: parseTimestamp(timestamp),
      k: optionalNumber(row, "slowk", "fastk", "k") ?? 0,
      d: optionalNumber(row, "slowd", "fastd", "d") ?? 0,
    };
  });
}

function parseAroon(series: Record<string, unknown>): AroonPoint[] {
  return entriesSorted(series).map(([timestamp, row]) => {
    if (!isRecord(row)) {
      throw new ParseError(`alphavantage: aroon row expected object, got ${describe(row)}`, {
        field: "Technical Analysis",
      });
    }
    return {
      timestamp: parseTimestamp(timestamp),
      up: optionalNumber(row, "aroonup", "up") ?? 0,
      down: optionalNumber(row, "aroondown", "down") ?? 0,
    };
  });
}

function parseHtSine(series: Record<string, unknown>): HtSinePoint[] {
  return entriesSorted(series).map(([timestamp, row]) => {
    if (!isRecord(row)) {
      throw new ParseError(`alphavantage: ht_sine row expected object, got ${describe(row)}`, {
        field: "Technical Analysis",
      });
    }
    return {
      timestamp: parseTimestamp(timestamp),
      sine: optionalNumber(row, "sine") ?? 0,
      leadSine: optionalNumber(row, "leadsine") ?? 0,
    };
  });
}

function parseHtPhasor(series: Record<string, unknown>): HtPhasorPoint[] {
  return entriesSorted(series).map(([timestamp, row]) => {
    if (!isRecord(row)) {
      throw new ParseError(`alphavantage: ht_phasor row expected object, got ${describe(row)}`, {
        field: "Technical Analysis",
      });
    }
    return {
      timestamp: parseTimestamp(timestamp),
      quadrature: optionalNumber(row, "quadrature") ?? 0,
      phase: optionalNumber(row, "phase") ?? 0,
    };
  });
}

/** Newest first (AV convention). */
function entriesSorted(series: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(series).sort(([a], [b]) => (a < b ? 1 : -1));
}
