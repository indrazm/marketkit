/**
 * Query layer: `https://api.twelvedata.com/<endpoint>?...&apikey=...` with
 * payload-level classification and response-meta extraction.
 */

import { type Transport } from "@marketkit/core";

export const BASE_URL = "https://api.twelvedata.com";

export interface TwelveDataApiOptions {
  apiKey: string;
  transport: Transport;
}

export class TwelveDataApi {
  readonly #apiKey: string;
  readonly #transport: Transport;

  constructor(options: TwelveDataApiOptions) {
    this.#apiKey = options.apiKey;
    this.#transport = options.transport;
  }

  async get<T>(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options?: { signal?: AbortSignal },
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") search.set(key, String(value));
    }
    search.set("apikey", this.#apiKey);
    const suffix = search.size > 0 ? `?${search}` : `?apikey=${encodeURIComponent(this.#apiKey)}`;
    return this.#transport.json<T>(`${BASE_URL}/${endpoint}${suffix}`, options);
  }
}
