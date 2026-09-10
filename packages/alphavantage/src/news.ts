/**
 * PRD §15: news domain — NEWS_SENTIMENT with substantially cleaned-up output.
 */

import { MarketResponse, ParseError } from "@marketkit/core";

import { AlphaVantageApi, AlphaVantageMetaFields, envelope, parseMeta } from "./api.js";
import type { NewsArticle, NewsSearchOptions } from "./types.js";
import {
  describe,
  isRecord,
  optionalNumber,
  optionalString,
  parseCompactDate,
  toProviderDate,
} from "./normalize.js";

export class NewsNamespace {
  constructor(private readonly api: AlphaVantageApi) {}

  async search(
    options: NewsSearchOptions,
  ): Promise<MarketResponse<NewsArticle[], AlphaVantageMetaFields>> {
    const params: Record<string, string | number | undefined> = {
      function: "NEWS_SENTIMENT",
      sort: options.sort,
      limit: options.limit,
    };
    if (options.symbols?.length) params.tickers = options.symbols.join(",");
    if (options.topics?.length) params.topics = options.topics.join(",");
    if (options.from) params.time_from = toProviderDate(options.from);
    if (options.to) params.time_to = toProviderDate(options.to);
    const payload = await this.api.get(params, options);
    const feed = (payload as { feed?: unknown }).feed;
    if (!Array.isArray(feed)) {
      throw new ParseError(`alphavantage: news: expected feed array, got ${describe(feed)}`, {
        field: "feed",
      });
    }
    const data = feed.map(parseArticle);
    return envelope(data, parseMeta(payload));
  }
}

function parseArticle(value: unknown): NewsArticle {
  if (!isRecord(value)) {
    throw new ParseError(`alphavantage: news: expected object, got ${describe(value)}`, {
      field: "feed[]",
    });
  }
  const published = optionalString(value, "timepublished");
  const article: NewsArticle = {
    title: optionalString(value, "title") ?? "",
    url: optionalString(value, "url") ?? "",
    source: optionalString(value, "source") ?? "",
    publishedAt: published ? parseCompactDate(published) : new Date(NaN),
  };
  const summary = optionalString(value, "summary");
  if (summary) article.summary = summary;
  const image = optionalString(value, "bannerimage");
  if (image) article.image = image;
  if (Array.isArray(value.authors)) {
    article.authors = value.authors.filter((a): a is string => typeof a === "string");
  }
  const categories: string[] = [];
  if (Array.isArray(value.category_within_topic)) {
    for (const entry of value.category_within_topic) {
      if (isRecord(entry)) {
        const topic = optionalString(entry, "topic");
        if (topic) categories.push(topic);
      }
    }
  }
  if (categories.length) article.categories = categories;
  const score = optionalNumber(value, "overallsentimentscore");
  const label = optionalString(value, "overallsentimentlabel");
  if (score !== undefined || label) {
    article.sentiment = { score: score ?? 0, label: label ?? "" };
  }
  if (Array.isArray(value.ticker_sentiment)) {
    article.tickers = value.ticker_sentiment.flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const symbol = optionalString(entry, "ticker");
      if (!symbol) return [];
      return [
        {
          symbol,
          relevance: optionalNumber(entry, "relevancescore") ?? 0,
          sentiment: optionalNumber(entry, "tickersentimentscore") ?? 0,
          label: optionalString(entry, "tickersentimentlabel"),
        },
      ];
    });
  }
  return article;
}
