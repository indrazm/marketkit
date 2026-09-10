/**
 * PRD §6 pattern: the `Finnhub` client. Same structure as the other MarketKit
 * provider clients so providers can be swapped behind MarketKit.
 */

import { Transport, type ProviderConfig } from "@marketkit/core";

import { classifyFinnhubPayload } from "./classify.js";
import {
  CalendarNamespace,
  CryptoNamespace,
  DataNamespace,
  EconomyNamespace,
  ForexNamespace,
  FundsNamespace,
  IndicatorNamespace,
  IndexNamespace,
  ScanNamespace,
} from "./domains.js";
import { FinnhubApi } from "./api.js";
import { FundamentalsNamespace } from "./fundamentals.js";
import { NewsNamespace } from "./news.js";
import { StocksNamespace } from "./stocks.js";

export const PROVIDER_NAME = "finnhub";

export class Finnhub {
  readonly stocks: StocksNamespace;
  readonly fundamentals: FundamentalsNamespace;
  readonly news: NewsNamespace;
  readonly indicators: IndicatorNamespace;
  readonly forex: ForexNamespace;
  readonly crypto: CryptoNamespace;
  readonly calendar: CalendarNamespace;
  readonly economy: EconomyNamespace;
  readonly index: IndexNamespace;
  readonly funds: FundsNamespace;
  readonly scan: ScanNamespace;
  readonly data: DataNamespace;
  readonly raw: FinnhubApi;

  readonly #api: FinnhubApi;
  readonly #transport: Transport;

  constructor(config: ProviderConfig) {
    this.#transport = new Transport({
      provider: PROVIDER_NAME,
      fetch: config.fetch,
      timeoutMs: config.timeout,
      retry: config.retry,
      logger: config.logger,
      // Finnhub mostly uses HTTP status codes; {"error": "..."} and candle
      // `s: "no_data"` payloads are classified here.
      classifyPayload: classifyFinnhubPayload,
    });
    this.#api = new FinnhubApi({ apiKey: config.apiKey, transport: this.#transport });
    this.stocks = new StocksNamespace(this.#api);
    this.fundamentals = new FundamentalsNamespace(this.#api);
    this.news = new NewsNamespace(this.#api);
    this.indicators = new IndicatorNamespace(this.#api);
    this.forex = new ForexNamespace(this.#api);
    this.crypto = new CryptoNamespace(this.#api);
    this.calendar = new CalendarNamespace(this.#api);
    this.economy = new EconomyNamespace(this.#api);
    this.index = new IndexNamespace(this.#api);
    this.funds = new FundsNamespace(this.#api);
    this.scan = new ScanNamespace(this.#api);
    this.data = new DataNamespace(this.#api);
    this.raw = this.#api;
  }
}
