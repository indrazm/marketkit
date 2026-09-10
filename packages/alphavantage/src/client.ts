/**
 * PRD §6: the `AlphaVantage` client. One class, small config, domain
 * namespaces off the instance (PRD §7).
 */

import { Transport, type ProviderConfig } from "@marketkit/core";

import { AlphaVantageApi } from "./api.js";
import { classifyAlphaVantagePayload } from "./classify.js";
import { FundamentalsNamespace } from "./fundamentals.js";
import { IndicatorsNamespace } from "./indicators.js";
import { MarketNamespace, OptionsNamespace, RawNamespace } from "./extra.js";
import { IndexesNamespace } from "./indexes.js";
import { IntelligenceNamespace } from "./intelligence.js";
import { NewsNamespace } from "./news.js";
import { CryptoNamespace, ForexNamespace } from "./markets.js";
import { CommoditiesNamespace, EconomyNamespace } from "./macro.js";
import { StocksNamespace } from "./stocks.js";

export const PROVIDER_NAME = "alphavantage";

export class AlphaVantage {
  readonly stocks: StocksNamespace;
  readonly fundamentals: FundamentalsNamespace;
  readonly news: NewsNamespace;
  readonly indicators: IndicatorsNamespace;
  readonly forex: ForexNamespace;
  readonly crypto: CryptoNamespace;
  readonly options: OptionsNamespace;
  readonly market: MarketNamespace;
  readonly commodities: CommoditiesNamespace;
  readonly economy: EconomyNamespace;
  readonly indexes: IndexesNamespace;
  readonly intelligence: IntelligenceNamespace;
  readonly raw: RawNamespace;

  readonly #api: AlphaVantageApi;
  readonly #transport: Transport;

  constructor(config: ProviderConfig) {
    this.#transport = new Transport({
      provider: PROVIDER_NAME,
      fetch: config.fetch,
      timeoutMs: config.timeout,
      retry: config.retry,
      logger: config.logger,
      // PRD §22: AV reports rate limits / invalid calls inside HTTP 200 bodies.
      classifyPayload: classifyAlphaVantagePayload,
    });
    this.#api = new AlphaVantageApi({ apiKey: config.apiKey, transport: this.#transport });
    const stocks = new StocksNamespace(this.#api);
    this.stocks = stocks;
    this.fundamentals = new FundamentalsNamespace(this.#api);
    this.news = new NewsNamespace(this.#api);
    this.indicators = new IndicatorsNamespace(this.#api);
    this.forex = new ForexNamespace(this.#api);
    this.crypto = new CryptoNamespace(this.#api);
    this.options = new OptionsNamespace(this.#api);
    this.market = new MarketNamespace(stocks);
    this.commodities = new CommoditiesNamespace(this.#api);
    this.economy = new EconomyNamespace(this.#api);
    this.indexes = new IndexesNamespace(this.#api);
    this.intelligence = new IntelligenceNamespace(this.#api);
    this.raw = new RawNamespace(this.#api);
  }
}
