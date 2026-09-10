/**
 * PRD §6 pattern: the `TwelveData` client. One class, small config, domain
 * namespaces off the instance — structurally identical to the Alpha Vantage
 * client so providers can be swapped behind MarketKit.
 */

import { Transport, type ProviderConfig } from "@marketkit/core";

import { TwelveDataApi } from "./api.js";
import { classifyTwelveDataPayload } from "./classify.js";
import {
  CalendarNamespace,
  CommoditiesNamespace,
  CryptoNamespace,
  ForexNamespace,
  OptionsNamespace,
  ReferenceNamespace,
} from "./domains.js";
import { FundamentalsNamespace } from "./fundamentals.js";
import { IndicatorsNamespace } from "./indicators.js";
import { StocksNamespace } from "./stocks.js";

export const PROVIDER_NAME = "twelvedata";

export class TwelveData {
  readonly stocks: StocksNamespace;
  readonly fundamentals: FundamentalsNamespace;
  readonly indicators: IndicatorsNamespace;
  readonly forex: ForexNamespace;
  readonly crypto: CryptoNamespace;
  readonly commodities: CommoditiesNamespace;
  readonly options: OptionsNamespace;
  readonly calendar: CalendarNamespace;
  readonly reference: ReferenceNamespace;
  readonly raw: TwelveDataApi;

  readonly #api: TwelveDataApi;
  readonly #transport: Transport;

  constructor(config: ProviderConfig) {
    this.#transport = new Transport({
      provider: PROVIDER_NAME,
      fetch: config.fetch,
      timeoutMs: config.timeout,
      retry: config.retry,
      logger: config.logger,
      // Twelve Data reports API errors inside HTTP 200 payloads.
      classifyPayload: classifyTwelveDataPayload,
    });
    this.#api = new TwelveDataApi({ apiKey: config.apiKey, transport: this.#transport });
    this.stocks = new StocksNamespace(this.#api);
    this.fundamentals = new FundamentalsNamespace(this.#api);
    this.indicators = new IndicatorsNamespace(this.#api);
    this.forex = new ForexNamespace(this.#api);
    this.crypto = new CryptoNamespace(this.#api);
    this.commodities = new CommoditiesNamespace(this.#api);
    this.options = new OptionsNamespace(this.#api);
    this.calendar = new CalendarNamespace(this.#api);
    this.reference = new ReferenceNamespace(this.#api);
    this.raw = this.#api;
  }
}
