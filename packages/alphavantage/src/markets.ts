/**
 * PRD §17–§18: forex and crypto domains. Pairs are typed objects internally;
 * "EUR/USD" strings are accepted and split.
 */

import { type MarketResponse, ParseError, type RequestOptions } from "@marketkit/core";

import { type AlphaVantageApi, type AlphaVantageMetaFields, envelope, parseMeta } from "./api.js";
import type {
  Candle,
  ForexCandle,
  CryptoHistoryOptions,
  CryptoPair,
  CryptoQuote,
  ForexHistoryOptions,
  ForexPair,
  ForexPairInput,
  ForexQuote,
} from "./types.js";
import {
  describe,
  isRecord,
  optionalNumber,
  optionalString,
  parseTimestamp,
  recordToCandle,
  requireNumber,
  type CandleParseOptions,
} from "./normalize.js";

const INTRADAY: Partial<Record<string, string>> = {
  "1m": "1min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "60m": "60min",
};

export function splitPair(pair: ForexPairInput): ForexPair {
  if (typeof pair === "string") {
    const [from, to] = pair.split("/");
    if (!from || !to) {
      throw new ParseError(`alphavantage: invalid pair ${describe(pair)}; expected "EUR/USD"`, {
        field: "pair",
      });
    }
    return { from: from.trim(), to: to.trim() };
  }
  return pair;
}

export class ForexNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  async quote(
    pair: ForexPairInput,
    options?: RequestOptions,
  ): Promise<MarketResponse<ForexQuote, AlphaVantageMetaFields>> {
    const { from, to } = splitPair(pair);
    const payload = await this.api.get(
      { function: "CURRENCY_EXCHANGE_RATE", from_currency: from, to_currency: to },
      options,
    );
    const section = findRateSection(payload);
    const refreshed = optionalString(section, "lastrefreshed");
    return envelope(
      {
        from: optionalString(section, "fromcurrencycode", "fromcurrency") ?? from,
        to: optionalString(section, "tocurrencycode", "tocurrency") ?? to,
        rate: requireNumber(section, "exchangerate"),
        bid: optionalNumber(section, "bidprice"),
        ask: optionalNumber(section, "askprice"),
        refreshedAt: refreshed ? parseTimestamp(refreshed) : new Date(),
        timezone: optionalString(section, "timezone"),
      },
      parseMeta(payload, `${from}${to}`),
    );
  }

  async history(
    pair: ForexPairInput,
    options: ForexHistoryOptions,
  ): Promise<MarketResponse<ForexCandle[], AlphaVantageMetaFields>> {
    const { from, to } = splitPair(pair);
    const interval = options.interval;
    const params: Record<string, string | number | undefined> = {
      from_symbol: from,
      to_symbol: to,
      outputsize: options.outputsize,
    };
    if (interval === "1d") params.function = "FX_DAILY";
    else if (interval === "1w") params.function = "FX_WEEKLY";
    else if (interval === "1mo") params.function = "FX_MONTHLY";
    else {
      params.function = "FX_INTRADAY";
      params.interval = `${interval.replace("m", "")}min`;
    }
    const payload = await this.api.get(params, options);
    return envelope(
      parseTimeSeries<ForexCandle>(payload, `${from}${to}`, { volume: "optional" }),
      parseMeta(payload, `${from}${to}`),
    );
  }
}

export class CryptoNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  async quote(
    pair: CryptoPair,
    options?: RequestOptions,
  ): Promise<MarketResponse<CryptoQuote, AlphaVantageMetaFields>> {
    const { symbol, currency } = pair;
    const payload = await this.api.get(
      { function: "CURRENCY_EXCHANGE_RATE", from_currency: symbol, to_currency: currency },
      options,
    );
    const section = findRateSection(payload);
    const refreshed = optionalString(section, "lastrefreshed");
    return envelope(
      {
        symbol: optionalString(section, "fromcurrencycode", "fromcurrency") ?? symbol,
        currency: optionalString(section, "tocurrencycode", "tocurrency") ?? currency,
        rate: requireNumber(section, "exchangerate"),
        bid: optionalNumber(section, "bidprice"),
        ask: optionalNumber(section, "askprice"),
        refreshedAt: refreshed ? parseTimestamp(refreshed) : new Date(),
        timezone: optionalString(section, "timezone"),
      },
      parseMeta(payload, symbol),
    );
  }

  async history(
    options: CryptoHistoryOptions,
  ): Promise<MarketResponse<Candle[], AlphaVantageMetaFields>> {
    const { symbol, currency, interval = "1d", outputsize, month } = options;
    const params: Record<string, string | number | undefined> = {
      symbol,
      market: currency,
      outputsize,
    };
    if (INTRADAY[interval]) {
      // Premium intraday endpoint.
      params.function = "CRYPTO_INTRADAY";
      params.interval = INTRADAY[interval];
      if (month) params.month = month;
    } else {
      params.function =
        interval === "1d"
          ? "DIGITAL_CURRENCY_DAILY"
          : interval === "1w"
            ? "DIGITAL_CURRENCY_WEEKLY"
            : "DIGITAL_CURRENCY_MONTHLY";
    }
    const payload = await this.api.get(params, options);
    return envelope(
      parseTimeSeries<Candle>(payload, symbol, { currency }),
      parseMeta(payload, symbol),
    );
  }
}

function findRateSection(payload: unknown): Record<string, unknown> {
  if (isRecord(payload)) {
    for (const value of Object.values(payload)) {
      if (isRecord(value)) return value;
    }
  }
  throw new ParseError("alphavantage: expected exchange-rate section", { field: "exchange rate" });
}

/** Shared "Time Series (...)" parser for FX and digital-currency series. */
function parseTimeSeries<T extends ForexCandle>(
  payload: unknown,
  symbol: string,
  parseOptions: CandleParseOptions = {},
): T[] {
  if (!isRecord(payload)) return [];
  const section = Object.entries(payload).find(
    ([key]) => key.toLowerCase().includes("time series") && isRecord(payload[key]),
  )?.[1];
  if (!isRecord(section)) {
    throw new ParseError("alphavantage: no time-series section in response", {
      field: "Time Series",
    });
  }
  return Object.entries(section)
    .map(([timestamp, row]) => {
      if (!isRecord(row)) {
        throw new ParseError(`alphavantage: expected object row at ${timestamp}`, {
          field: "Time Series",
        });
      }
      return recordToCandle<T>(row, timestamp, parseOptions);
    })
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
