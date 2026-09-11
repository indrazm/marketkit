/**
 * PRD §6 pattern: the `Massive` client. Same structure as the other MarketKit
 * provider clients so providers can be swapped behind MarketKit.
 */

import { Transport, type ProviderConfig } from "@marketkit/core";

import { MassiveApi } from "./api.js";
import { classifyMassivePayload } from "./classify.js";
import {
  AlternativeNamespace,
  CryptoNamespace,
  EconomyNamespace,
  ForexNamespace,
  FuturesNamespace,
  IndicatorsNamespace,
  IndicesNamespace,
  MarketNamespace,
  OptionsNamespace,
  PartnersNamespace,
  ReferenceNamespace,
} from "./domains.js";
import { StocksNamespace } from "./stocks.js";

export const PROVIDER_NAME = "massive";

export class Massive {
  readonly stocks: StocksNamespace;
  readonly reference: ReferenceNamespace;
  readonly market: MarketNamespace;
  readonly options: OptionsNamespace;
  readonly forex: ForexNamespace;
  readonly crypto: CryptoNamespace;
  readonly indices: IndicesNamespace;
  readonly indicators: IndicatorsNamespace;
  readonly economy: EconomyNamespace;
  readonly futures: FuturesNamespace;
  readonly partners: PartnersNamespace;
  readonly alternative: AlternativeNamespace;
  readonly raw: MassiveApi;

  readonly #api: MassiveApi;
  readonly #transport: Transport;

  constructor(config: ProviderConfig) {
    // Massive uses proper HTTP status codes (401/403/429), handled by the
    // core transport's error mapping and retry rules.
    this.#transport = new Transport({
      provider: PROVIDER_NAME,
      fetch: config.fetch,
      timeoutMs: config.timeout,
      retry: config.retry,
      logger: config.logger,
      classifyPayload: classifyMassivePayload,
    });
    this.#api = new MassiveApi({ apiKey: config.apiKey, transport: this.#transport });
    this.stocks = new StocksNamespace(this.#api);
    this.reference = new ReferenceNamespace(this.#api);
    this.market = new MarketNamespace(this.#api);
    this.options = new OptionsNamespace(this.#api);
    this.forex = new ForexNamespace(this.#api);
    this.crypto = new CryptoNamespace(this.#api);
    this.indices = new IndicesNamespace(this.#api);
    this.indicators = new IndicatorsNamespace(this.#api);
    this.economy = new EconomyNamespace(this.#api);
    this.futures = new FuturesNamespace(this.#api);
    this.partners = new PartnersNamespace(this.#api);
    this.alternative = new AlternativeNamespace(this.#api);
    this.raw = this.#api;
  }
}
