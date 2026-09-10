/**
 * Query layer: `function=...` requests against www.alphavantage.co/query with
 * payload-level classification (PRD §22) and response-meta extraction (§21).
 */

import { MarketResponse, type ResponseMeta, Transport } from "@marketkit/core";

import { field, isRecord, parseTimestamp, optionalString } from "./normalize.js";

export const BASE_URL = "https://www.alphavantage.co/query";

export interface AlphaVantageApiOptions {
  apiKey: string;
  transport: Transport;
}

export class AlphaVantageApi {
  readonly #apiKey: string;
  readonly #transport: Transport;

  constructor(options: AlphaVantageApiOptions) {
    this.#apiKey = options.apiKey;
    this.#transport = options.transport;
  }

  /** JSON request for `function` + parameters, with the classifier attached. */
  async get<T>(
    params: Record<string, string | number | boolean | undefined>,
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    search.set("apikey", this.#apiKey);
    return this.#transport.json<T>(`${BASE_URL}?${search}`, options);
  }

  /** Raw-text request (CSV endpoints such as the calendars). */
  async text(
    params: Record<string, string | number | boolean | undefined>,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    search.set("apikey", this.#apiKey);
    return this.#transport.text(`${BASE_URL}?${search}`, options);
  }

  /** JSON request from a pre-built query (repeated-parameter endpoints). */
  async rawGet<T>(search: URLSearchParams, options?: { signal?: AbortSignal }): Promise<T> {
    search.set("apikey", this.#apiKey);
    return this.#transport.json<T>(`${BASE_URL}?${search}`, options);
  }
}

/** Extract `"Meta Data"` (provider naming: "2. Symbol", "3. Last Refreshed"...). */
export function parseMeta(payload: unknown, fallbackSymbol?: string): AlphaVantageMetaFields {
  const meta: AlphaVantageMetaFields = {
    provider: "alphavantage",
    fetchedAt: new Date(),
    symbol: fallbackSymbol,
  };
  if (!isRecord(payload)) return meta;
  const section = Object.entries(payload).find(
    ([key]) => key.toLowerCase().replace(/[^a-z]/g, "") === "metadata",
  )?.[1];
  if (!isRecord(section)) return meta;
  const symbol = field(section, "symbol");
  const lastRefreshed = field(section, "lastrefreshed");
  const timezone = field(section, "timezone");
  const information = optionalString(section, "information");
  return {
    provider: "alphavantage",
    fetchedAt: new Date(),
    symbol: typeof symbol === "string" && symbol !== "" ? symbol : fallbackSymbol,
    lastRefreshed:
      typeof lastRefreshed === "string" && lastRefreshed !== ""
        ? parseTimestamp(lastRefreshed)
        : undefined,
    timezone: typeof timezone === "string" ? timezone : undefined,
    information,
  };
}

export interface AlphaVantageMetaFields extends ResponseMeta {
  provider: "alphavantage";
  symbol?: string;
  lastRefreshed?: Date;
  timezone?: string;
  information?: string;
}

export function envelope<T>(
  data: T,
  meta: AlphaVantageMetaFields,
): MarketResponse<T, AlphaVantageMetaFields> {
  return { data, meta };
}

export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}
