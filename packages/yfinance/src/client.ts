/**
 * PRD §6 pattern: the `YFinance` client. Same structure as the other MarketKit
 * provider clients so providers can be swapped behind MarketKit.
 *
 * Yahoo needs no API key — `apiKey` is optional and ignored. A browser-like
 * `User-Agent` is sent by default (Yahoo rejects default fetch agents);
 * override it with `userAgent` when embedding.
 */

import { Transport, type ProviderConfig } from "@marketkit/core";

import { YahooApi } from "./api.js";
import { classifyYahooPayload } from "./classify.js";
import { CryptoNamespace, ForexNamespace, MarketNamespace, OptionsNamespace } from "./domains.js";
import { FundamentalsNamespace } from "./fundamentals.js";
import { NewsNamespace } from "./news.js";
import { StocksNamespace } from "./stocks.js";

export const PROVIDER_NAME = "yfinance";

export interface YFinanceConfig extends Omit<ProviderConfig, "apiKey"> {
  /** Accepted for shape parity; Yahoo is keyless and ignores it. */
  apiKey?: string;
  /** Override the default browser-like User-Agent header. */
  userAgent?: string;
}

export class YFinance {
  readonly stocks: StocksNamespace;
  readonly fundamentals: FundamentalsNamespace;
  readonly options: OptionsNamespace;
  readonly news: NewsNamespace;
  readonly market: MarketNamespace;
  readonly forex: ForexNamespace;
  readonly crypto: CryptoNamespace;
  readonly raw: YahooApi;

  readonly #api: YahooApi;
  readonly #transport: Transport;

  constructor(config: YFinanceConfig) {
    this.#transport = new Transport({
      provider: PROVIDER_NAME,
      fetch: config.fetch,
      timeoutMs: config.timeout,
      retry: config.retry,
      logger: config.logger,
      // Yahoo signals "not found" inside HTTP 200 chart/quote payloads
      // (`{chart: {error: ...}}`); HTTP statuses ride the core transport.
      classifyPayload: classifyYahooPayload,
    });
    this.#api = new YahooApi({ transport: this.#transport, userAgent: config.userAgent });
    this.stocks = new StocksNamespace(this.#api);
    this.fundamentals = new FundamentalsNamespace(this.#api);
    this.options = new OptionsNamespace(this.#api);
    this.news = new NewsNamespace(this.#api);
    this.market = new MarketNamespace(this.#api);
    this.forex = new ForexNamespace(this.#api);
    this.crypto = new CryptoNamespace(this.#api);
    this.raw = this.#api;
  }
}
