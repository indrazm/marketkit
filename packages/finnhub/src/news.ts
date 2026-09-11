/** News domain: market news, company news, sentiment, press releases. */

import { type MarketResponse, type RequestOptions } from "@marketkit/core";

import { envelope, meta, parseTimestamp, type FinnhubApi } from "./api.js";
import type { LooseData, NewsArticle, NewsSentimentBuzz } from "./types.js";
import { deepNumeric } from "./shared.js";

type Meta = { provider: "finnhub"; fetchedAt: Date };

function parseArticle(row: unknown): NewsArticle {
  const r = deepNumeric(row) as Record<string, unknown>;
  return {
    category: String(r.category ?? ""),
    datetime: parseTimestamp(Number(r.datetime ?? 0)),
    headline: String(r.headline ?? ""),
    url: String(r.url ?? ""),
    source: String(r.source ?? ""),
    summary: String(r.summary ?? ""),
    image: typeof r.image === "string" ? r.image : undefined,
    related: String(r.related ?? ""),
    id: Number(r.id ?? 0),
  };
}

export class NewsNamespace {
  constructor(private readonly api: FinnhubApi) {}

  /** `/news` — latest market news by category. */
  async marketNews(
    category: "general" | "forex" | "crypto" | "merger",
    options?: RequestOptions,
  ): Promise<MarketResponse<NewsArticle[], Meta>> {
    const payload = await this.api.get("news", { category }, options);
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(rows.map(parseArticle), meta());
  }

  /** `/company-news` — news for a symbol between dates. */
  async companyNews(
    symbol: string,
    options: { from: string; to: string } & RequestOptions,
  ): Promise<MarketResponse<NewsArticle[], Meta>> {
    const payload = await this.api.get(
      "company-news",
      { symbol, from: options.from, to: options.to },
      options,
    );
    const rows = Array.isArray(payload) ? payload : [];
    return envelope(rows.map(parseArticle), meta());
  }

  /** `/news-sentiment` — buzz and sentiment scores for a symbol. */
  async sentiment(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<NewsSentimentBuzz, Meta>> {
    const payload = await this.api.get("news-sentiment", { symbol }, options);
    return envelope(deepNumeric(payload) as NewsSentimentBuzz, meta());
  }

  /** `/press-releases`. */
  async pressReleases(
    symbol: string,
    options?: RequestOptions,
  ): Promise<MarketResponse<LooseData[], Meta>> {
    const payload = await this.api.get("press-releases", { symbol }, options);
    const rows = (payload as { majorDevelopment?: unknown[] }).majorDevelopment ?? [];
    return envelope(
      (Array.isArray(rows) ? rows : []).map((row) => deepNumeric(row) as LooseData),
      meta(),
    );
  }
}
