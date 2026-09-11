/**
 * Technical indicators (docs: Technical indicators, 100+ functions). One
 * `get(name, ...)` mechanism with literal-name overloads for shaped results;
 * helpers delegate to `get`.
 */

import { type MarketResponse, ParseError } from "@marketkit/core";

import { type TwelveDataApi } from "./api.js";
import {
  describe,
  envelope,
  parseMeta,
  parseTimestamp,
  requireRecord,
  type TwelveDataMetaFields,
} from "./normalize.js";
import type {
  AroonPoint,
  BbandsPoint,
  HtPhasorPoint,
  HtSinePoint,
  IndicatorName,
  IndicatorOptions,
  IndicatorPoint,
  KnownIndicatorName,
  MacdOptions,
  MacdPoint,
  StochPoint,
} from "./types.js";

/** Indicators whose rows carry multiple named values. */
type AnyShapedPoint =
  | IndicatorPoint
  | MacdPoint
  | BbandsPoint
  | StochPoint
  | AroonPoint
  | HtSinePoint
  | HtPhasorPoint;

export class IndicatorsNamespace {
  constructor(private readonly api: TwelveDataApi) {}

  async get(
    name: "macd",
    options: MacdOptions,
  ): Promise<MarketResponse<MacdPoint[], TwelveDataMetaFields>>;
  async get(
    name: "bbands",
    options: IndicatorOptions,
  ): Promise<MarketResponse<BbandsPoint[], TwelveDataMetaFields>>;
  async get(
    name: "stoch",
    options: IndicatorOptions,
  ): Promise<MarketResponse<StochPoint[], TwelveDataMetaFields>>;
  async get(
    name: "stochf",
    options: IndicatorOptions,
  ): Promise<MarketResponse<StochPoint[], TwelveDataMetaFields>>;
  async get(
    name: "aroon",
    options: IndicatorOptions,
  ): Promise<MarketResponse<AroonPoint[], TwelveDataMetaFields>>;
  async get(
    name: "ht_sine",
    options: IndicatorOptions,
  ): Promise<MarketResponse<HtSinePoint[], TwelveDataMetaFields>>;
  async get(
    name: "ht_phasor",
    options: IndicatorOptions,
  ): Promise<MarketResponse<HtPhasorPoint[], TwelveDataMetaFields>>;
  async get(
    name: KnownIndicatorName,
    options: IndicatorOptions,
  ): Promise<MarketResponse<IndicatorPoint[], TwelveDataMetaFields>>;
  async get(
    name: IndicatorName,
    options: IndicatorOptions,
  ): Promise<MarketResponse<AnyShapedPoint[], TwelveDataMetaFields>>;
  async get(
    name: IndicatorName,
    options: IndicatorOptions,
  ): Promise<MarketResponse<AnyShapedPoint[], TwelveDataMetaFields>> {
    const lower = name.toLowerCase();
    const params: Record<string, string | number | undefined> = {
      symbol: options.symbol,
      interval: options.interval,
      exchange: options.exchange,
      series_type: options.seriesType ?? "close",
      ...options.params,
    };
    if (options.period !== undefined) params.time_period = options.period;
    if (lower === "macd") {
      const macd = options as MacdOptions;
      params.fastperiod = macd.fastPeriod ?? 12;
      params.slowperiod = macd.slowPeriod ?? 26;
      params.signalperiod = macd.signalPeriod ?? 9;
    }
    if (lower === "bbands") {
      const bb = options as MacdOptions;
      params.time_period = bb.period ?? 20;
      params.sd = bb.signalPeriod ?? 2;
    }
    const payload = await this.api.get<unknown>(lower, params, options);
    const meta = parseMeta(payload, options.symbol);
    const rows = requireValues(payload, name);
    switch (lower) {
      case "macd":
        return envelope(
          parseRows<MacdPoint>(rows, {
            macd: ["macd"],
            signal: ["macd_signal", "signal"],
            histogram: ["macd_hist", "histogram"],
          }),
          meta,
        );
      case "bbands":
        return envelope(
          parseRows<BbandsPoint>(rows, {
            upper: ["upper_band", "realupperband", "upper"],
            middle: ["middle_band", "realmiddleband", "middle"],
            lower: ["lower_band", "reallowerband", "lower"],
          }),
          meta,
        );
      case "stoch":
        return envelope(
          parseRows<StochPoint>(rows, { k: ["slow_k", "slowk", "k"], d: ["slow_d", "slowd", "d"] }),
          meta,
        );
      case "stochf":
        return envelope(
          parseRows<StochPoint>(rows, { k: ["fast_k", "fastk", "k"], d: ["fast_d", "fastd", "d"] }),
          meta,
        );
      case "aroon":
        return envelope(
          parseRows<AroonPoint>(rows, { up: ["aroon_up", "up"], down: ["aroon_down", "down"] }),
          meta,
        );
      case "ht_sine":
        return envelope(
          parseRows<HtSinePoint>(rows, { sine: ["sine"], leadSine: ["leadsine"] }),
          meta,
        );
      case "ht_phasor":
        return envelope(
          parseRows<HtPhasorPoint>(rows, { quadrature: ["quadrature"], phase: ["phase"] }),
          meta,
        );
      default:
        return envelope(parseSingle(rows, lower), meta);
    }
  }

  // Ergonomic helpers (PRD §16 pattern) — all delegate to `get`.
  sma(options: IndicatorOptions) {
    return this.get("sma", options);
  }
  ema(options: IndicatorOptions) {
    return this.get("ema", options);
  }
  wma(options: IndicatorOptions) {
    return this.get("wma", options);
  }
  dema(options: IndicatorOptions) {
    return this.get("dema", options);
  }
  tema(options: IndicatorOptions) {
    return this.get("tema", options);
  }
  trima(options: IndicatorOptions) {
    return this.get("trima", options);
  }
  kama(options: IndicatorOptions) {
    return this.get("kama", options);
  }
  t3ma(options: IndicatorOptions) {
    return this.get("t3ma", options);
  }
  rsi(options: IndicatorOptions) {
    return this.get("rsi", options);
  }
  atr(options: IndicatorOptions) {
    return this.get("atr", options);
  }
  adx(options: IndicatorOptions) {
    return this.get("adx", options);
  }
  willr(options: IndicatorOptions) {
    return this.get("willr", options);
  }
  obv(options: IndicatorOptions) {
    return this.get("obv", options);
  }
  mfi(options: IndicatorOptions) {
    return this.get("mfi", options);
  }
  cci(options: IndicatorOptions) {
    return this.get("cci", options);
  }
  mom(options: IndicatorOptions) {
    return this.get("mom", options);
  }
  stoch(options: IndicatorOptions) {
    return this.get("stoch", options);
  }
  macd(options: MacdOptions) {
    return this.get("macd", options);
  }
  bbands(options: IndicatorOptions) {
    return this.get("bbands", options);
  }
  aroon(options: IndicatorOptions) {
    return this.get("aroon", options);
  }
  supertrend(options: IndicatorOptions) {
    return this.get("supertrend", options);
  }
  keltner(options: IndicatorOptions) {
    return this.get("keltner", options);
  }
  vwap(options: IndicatorOptions) {
    return this.get("vwap", options);
  }
}

function requireValues(payload: unknown, name: string): unknown[] {
  const record = requireRecord(payload, "response");
  const values = record.values;
  if (!Array.isArray(values)) {
    throw new ParseError(
      `twelvedata: indicators.get(${name}): expected values array, got ${describe(values)}`,
      { field: "values" },
    );
  }
  return values;
}

/** Map each row's datetime + named fields onto a shaped point. */
function parseRows<T extends object>(
  rows: unknown[],
  fields: Partial<Record<keyof T, string[]>>,
): T[] {
  return rows.map((row) => {
    const record = requireRecord(row, "values[]");
    const datetime = record.datetime;
    if (typeof datetime !== "string") {
      throw new ParseError("twelvedata: indicator row missing datetime", { field: "datetime" });
    }
    const out = { timestamp: parseTimestamp(datetime) } as unknown as T;
    for (const [key, keywords] of Object.entries(fields) as Array<[keyof T, string[]]>) {
      const value = pickNumber(record, keywords);
      (out as Record<string, unknown>)[key as string] = value ?? 0;
    }
    return out;
  });
}

function parseSingle(rows: unknown[], name: string): IndicatorPoint[] {
  return rows.map((row) => {
    const record = requireRecord(row, "values[]");
    const datetime = record.datetime;
    if (typeof datetime !== "string") {
      throw new ParseError("twelvedata: indicator row missing datetime", { field: "datetime" });
    }
    // Value key matches the indicator name (e.g. "rsi", "sma"); fall back to
    // the sole numeric field for multi-name endpoints like MAMA.
    const lowered = Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]/g, ""), v]),
    ) as Record<string, unknown>;
    const value = pickNumber(lowered, [name.replace(/[^a-z0-9]/g, "")]) ?? pickSoleNumber(lowered);
    if (value === undefined) {
      throw new ParseError(
        `twelvedata: indicators.get(${name}): row has no numeric value: ${describe(row)}`,
        { field: name },
      );
    }
    return { timestamp: parseTimestamp(datetime), value };
  });
}

function pickNumber(record: Record<string, unknown>, keywords: string[]): number | undefined {
  const lowered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    lowered[key.toLowerCase().replace(/[^a-z0-9]/g, "")] = value;
  }
  for (const keyword of keywords) {
    const bare = keyword.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const [key, value] of Object.entries(lowered)) {
      if (key === bare && typeof value !== "undefined") {
        const parsed = typeof value === "string" ? Number(value) : value;
        if (typeof parsed === "number" && Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return undefined;
}

function pickSoleNumber(record: Record<string, unknown>): number | undefined {
  const numericEntries = Object.entries(record).filter(
    ([key, value]) =>
      key !== "datetime" && typeof value !== "undefined" && Number.isFinite(Number(value)),
  );
  if (numericEntries.length !== 1) return undefined;
  return Number(numericEntries[0][1]);
}
