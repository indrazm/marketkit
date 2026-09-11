/**
 * News domain: `v1/finance/search` embedded news (`Ticker.news` parity),
 * normalized to the shared article shape.
 */

import type { MarketResponse, RequestOptions } from "@marketkit/core";

import { envelope, type YahooApi } from "./api.js";
import { isRecord, optionalDate, optionalString } from "./shared.js";
import type { NewsArticle, YahooMeta } from "./types.js";

function meta(): YahooMeta {
  return { provider: "yfinance", fetchedAt: new Date() };
}

export function decodeArticle(row: unknown): NewsArticle {
  const r = isRecord(row) ? row : {};
  const tickers = Array.isArray(r.relatedTickers)
    ? r.relatedTickers.filter((t): t is string => typeof t === "string")
    : [];
  return {
    id: optionalString(r.uuid) ?? optionalString(r.id),
    title: String(r.title ?? ""),
    url: optionalString(r.link) ?? optionalString(r.url),
    source: optionalString(r.publisher),
    publishedUtc: optionalDate(r.providerPublishTime) ?? optionalDate(r.publishedAt) ?? undefined,
    tickers,
    summary: optionalString(r.summary),
    imageUrl:
      optionalString((isRecord(r.thumbnail) ? r.thumbnail.resolutions : undefined) as unknown) ??
      undefined,
  };
}

export class NewsNamespace {
  constructor(private readonly api: YahooApi) {}

  /** Latest news for a symbol via the search endpoint's news rail. */
  async forSymbol(
    symbol: string,
    options?: RequestOptions & { count?: number },
  ): Promise<MarketResponse<NewsArticle[], YahooMeta>> {
    const payload = await this.api.getQuery2<unknown>(
      "v1/finance/search",
      { q: symbol, quotesCount: 0, newsCount: options?.count ?? 10 },
      options,
    );
    const news = isRecord(payload) ? payload.news : undefined;
    const rows = Array.isArray(news) ? news : [];
    return envelope(rows.map(decodeArticle), meta());
  }
}
