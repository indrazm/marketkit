import { YFinance } from "../dist/index.js";
import { AuthenticationError, NotFoundError } from "@marketkit/core";

const responses = [];
let calls = [];
let agents = [];

const fetchMock = async (url, init) => {
  calls.push(url);
  agents.push(init?.headers?.["User-Agent"]);
  if (init?.signal?.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }
  const next = responses.shift();
  if (!next) throw new Error("no scripted response for " + url);
  const [status, body] = Array.isArray(next) ? next : [200, next];
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: () => null },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
};

const market = new YFinance({ fetch: fetchMock });
let passed = 0;
const ok = (name, cond) => {
  if (!cond) {
    console.error("FAIL", name);
    process.exitCode = 1;
  } else {
    passed++;
    console.log("ok", name);
  }
};

// 1. history — chart columns → newest-first candles with adj close
responses.push({
  chart: {
    result: [
      {
        meta: { currency: "USD", symbol: "AAPL", exchangeName: "NMS" },
        timestamp: [1725715200, 1725801600],
        indicators: {
          quote: [
            {
              open: [236, 237],
              high: [238, 240],
              low: [234, 235],
              close: [237, 239],
              volume: [50000000, 51234567],
            },
          ],
          adjclose: [{ adjclose: [236.5, 238.5] }],
        },
      },
    ],
    error: null,
  },
});
const h = await market.stocks.history("AAPL", { interval: "1d", range: "1mo" });
ok("history parsed", h.data[0].close === 239 && h.data[1].close === 237);
ok("history newest first", h.data[0].timestamp > h.data[1].timestamp);
ok("history adjClose", h.data[0].adjClose === 238.5 && h.data[0].volume === 51234567);
ok(
  "history meta",
  h.meta.provider === "yfinance" && h.meta.currency === "USD" && h.meta.exchange === "NMS",
);
ok(
  "history url",
  calls.at(-1).includes("query1.finance.yahoo.com/v8/finance/chart/AAPL") &&
    calls.at(-1).includes("interval=1d") &&
    calls.at(-1).includes("range=1mo"),
);
ok("user-agent sent", typeof agents.at(-1) === "string" && agents.at(-1).includes("Mozilla"));

// 2. explicit from/to → period1/period2 epoch
responses.push({
  chart: {
    result: [
      {
        meta: {},
        timestamp: [1725801600],
        indicators: { quote: [{ open: [1], high: [2], low: [0.5], close: [1.9] }] },
      },
    ],
    error: null,
  },
});
const h2 = await market.stocks.history("AAPL", { from: "2026-01-01", to: "2026-09-08" });
ok(
  "history bounds",
  h2.data[0].close === 1.9 &&
    calls.at(-1).includes("period1=1767225600") &&
    calls.at(-1).includes("period2="),
);

// 3. null OHLC rows skipped
responses.push({
  chart: {
    result: [
      {
        meta: {},
        timestamp: [1725715200, 1725801600],
        indicators: {
          quote: [
            {
              open: [null, 237],
              high: [null, 240],
              low: [null, 235],
              close: [null, 239],
              volume: [null, 100],
            },
          ],
        },
      },
    ],
    error: null,
  },
});
const h3 = await market.stocks.history("AAPL", { interval: "1d", range: "5d" });
ok("null bars skipped", h3.data.length === 1 && h3.data[0].close === 239);

// 4. actions — dividends + splits
responses.push({
  chart: {
    result: [
      {
        meta: {},
        timestamp: [1725801600],
        indicators: { quote: [{ open: [1], high: [2], low: [0.5], close: [1.9] }] },
        events: {
          dividends: { 1725801600: { amount: 0.25, date: 1725801600 } },
          splits: {
            1725801600: { date: 1725801600, numerator: 4, denominator: 1, splitRatio: "4:1" },
          },
        },
      },
    ],
    error: null,
  },
});
const a = await market.stocks.actions("AAPL", { range: "1mo" });
ok(
  "actions parsed",
  a.data.dividends[0].amount === 0.25 &&
    a.data.splits[0].numerator === 4 &&
    a.data.dividends[0].timestamp instanceof Date,
);
ok("actions events param", calls.at(-1).includes("events=div%2Csplit"));

// 5. quote — cryptic keys decoded
responses.push({
  quoteResponse: {
    result: [
      {
        symbol: "AAPL",
        longName: "Apple Inc.",
        fullExchangeName: "NasdaqGS",
        currency: "USD",
        regularMarketPrice: 239.12,
        regularMarketPreviousClose: 237.88,
        regularMarketOpen: 237,
        regularMarketDayHigh: 240,
        regularMarketDayLow: 235,
        regularMarketChange: 1.24,
        regularMarketChangePercent: 0.5213,
        regularMarketVolume: 51234567,
        averageDailyVolume3Month: 60000000,
        marketCap: 3600000000000,
        trailingPE: 35.2,
        marketState: "CLOSED",
        quoteType: "EQUITY",
        regularMarketTime: 1725801600,
      },
    ],
    error: null,
  },
});
const q = await market.stocks.quote("AAPL");
ok("quote decoded", q.data.price === 239.12 && q.data.previousClose === 237.88);
ok("quote extras", q.data.name === "Apple Inc." && q.data.marketCap === 3600000000000);
ok("quote asOf Date", q.data.asOf instanceof Date && q.data.asOf.getUTCFullYear() === 2024);
ok("quote url", calls.at(-1).includes("v7/finance/quote") && calls.at(-1).includes("symbols=AAPL"));

// 6. batch quotes
responses.push({
  quoteResponse: {
    result: [
      { symbol: "AAPL", regularMarketPrice: 239.12 },
      { symbol: "MSFT", regularMarketPrice: 428.5 },
    ],
    error: null,
  },
});
const qs = await market.stocks.quotes(["AAPL", "MSFT"]);
ok(
  "batch quotes",
  qs.data.length === 2 &&
    qs.data[1].price === 428.5 &&
    calls.at(-1).includes("symbols=AAPL%2CMSFT"),
);

// 7. spark
responses.push({
  spark: {
    result: [{ symbol: "AAPL", timestamp: [1725801300, 1725801600], close: [238.9, 239.12] }],
    error: null,
  },
});
const sp = await market.stocks.spark(["AAPL"]);
ok("spark", sp.data[0].closes.at(-1) === 239.12 && sp.data[0].timestamps[0] instanceof Date);

// 8. quoteSummary modules
responses.push({
  quoteSummary: {
    result: [
      {
        price: { marketCap: { raw: 3600000000000, fmt: "3.6T" } },
        summaryDetail: {
          trailingPE: { raw: 35.2, fmt: "35.20" },
          dividendYield: { raw: 0.0044, fmt: "0.44%" },
        },
        defaultKeyStatistics: { beta: { raw: 1.24, fmt: "1.24" } },
        assetProfile: { sector: "Technology", longBusinessSummary: "Makes phones." },
      },
    ],
    error: null,
  },
});
const st = await market.fundamentals.statistics("AAPL");
ok("statistics decoded", st.data.beta === 1.24 && st.data.trailingPE === 35.2);
ok(
  "modules url",
  calls.at(-1).includes("v10/finance/quoteSummary/AAPL") && calls.at(-1).includes("modules="),
);
responses.push({
  quoteSummary: {
    result: [
      {
        incomeStatementHistory: {
          incomeStatementHistory: [
            {
              endDate: { raw: 1726358400, fmt: "2024-09-14" },
              totalRevenue: { raw: 391000000000 },
            },
          ],
          maxAge: 1,
        },
        incomeStatementHistoryQuarterly: { incomeStatementHistory: [], maxAge: 1 },
      },
    ],
    error: null,
  },
});
const inc = await market.fundamentals.incomeStatements("AAPL");
ok(
  "income statements",
  inc.data[0].timeframe === "annual" &&
    inc.data[0].totalRevenue === 391000000000 &&
    inc.data[0].endDate instanceof Date,
);

// 9. calendar + earnings + holders + analysis + profile
responses.push({
  quoteSummary: {
    result: [
      {
        calendarEvents: {
          earningsDate: [{ raw: 1761868800 }],
          exDividendDate: { raw: 1760928000 },
        },
      },
    ],
    error: null,
  },
});
const cal = await market.fundamentals.calendar("AAPL");
ok(
  "calendar dates",
  cal.data.earningsDate instanceof Date && cal.data.exDividendDate instanceof Date,
);
responses.push({ quoteSummary: { result: [{ earningsHistory: { history: [] } }], error: null } });
ok("earnings", (await market.fundamentals.earnings("AAPL")).data.earningsHistory !== undefined);
responses.push({ quoteSummary: { result: [{ majorHoldersBreakdown: {} }], error: null } });
ok("holders", (await market.fundamentals.holders("AAPL")).data.majorHoldersBreakdown !== undefined);
responses.push({ quoteSummary: { result: [{ recommendationTrend: {} }], error: null } });
ok("analysis", (await market.fundamentals.analysis("AAPL")).data.recommendationTrend !== undefined);
responses.push({
  quoteSummary: { result: [{ assetProfile: { sector: "Technology" } }], error: null },
});
ok("profile", (await market.fundamentals.profile("AAPL")).data.assetProfile !== undefined);

// 10. options — expirations + chain
responses.push({
  optionChain: {
    result: [{ underlyingSymbol: "AAPL", expirationDates: [1761868800, 1762473600], options: [] }],
    error: null,
  },
});
const ex = await market.options.expirations("AAPL");
ok(
  "expirations",
  ex.data.length === 2 &&
    ex.data[0] instanceof Date &&
    calls.at(-1).includes("v7/finance/options/AAPL"),
);
responses.push({
  optionChain: {
    result: [
      {
        underlyingSymbol: "AAPL",
        expirationDates: [1761868800],
        options: [
          {
            expirationDate: 1761868800,
            calls: [
              {
                contractSymbol: "AAPL261031C00200000",
                strike: 200,
                lastPrice: 12.5,
                volume: 100,
                openInterest: 500,
                bid: 12.3,
                ask: 12.7,
                impliedVolatility: 0.25,
                inTheMoney: true,
              },
            ],
            puts: [{ contractSymbol: "AAPL261031P00200000", strike: 200 }],
          },
        ],
      },
    ],
    error: null,
  },
});
const ch = await market.options.chain("AAPL");
ok(
  "chain decoded",
  ch.data.underlyingSymbol === "AAPL" &&
    ch.data.slices[0].calls[0].strike === 200 &&
    ch.data.slices[0].calls[0].inTheMoney === true &&
    ch.data.slices[0].expiration instanceof Date,
);

// 11. search + news
responses.push({
  quotes: [{ symbol: "AAPL", longname: "Apple Inc.", exchange: "NMS", quoteType: "EQUITY" }],
  news: [
    {
      uuid: "abc-123",
      title: "Apple news",
      link: "https://example.com/a",
      publisher: "Reuters",
      providerPublishTime: "2026-09-08T12:00:00Z",
      relatedTickers: ["AAPL"],
      summary: "Summary here.",
    },
  ],
});
const se = await market.market.search("apple");
ok("search hits", se.data.hits[0].symbol === "AAPL" && se.data.hits[0].name === "Apple Inc.");
ok(
  "search news",
  se.data.news[0].title === "Apple news" && se.data.news[0].publishedUtc instanceof Date,
);
ok("search url", calls.at(-1).includes("query2.finance.yahoo.com/v1/finance/search"));
responses.push({
  quotes: [],
  news: [{ uuid: "n1", title: "T", link: "https://x", publisher: "P", relatedTickers: ["AAPL"] }],
});
const nw = await market.news.forSymbol("AAPL");
ok("news.forSymbol", nw.data[0].id === "n1" && nw.data[0].tickers[0] === "AAPL");

// 12. movers / screener
responses.push({
  finance: {
    result: [
      { quotes: [{ symbol: "NVDA", regularMarketPrice: 190.5, regularMarketChangePercent: 5.2 }] },
    ],
    error: null,
  },
});
const mv = await market.market.movers("day_gainers");
ok(
  "movers",
  mv.data[0].symbol === "NVDA" &&
    calls.at(-1).includes("screener/predefined/saved") &&
    calls.at(-1).includes("scrIds=day_gainers"),
);

// 13. forex + crypto
responses.push({
  chart: {
    result: [
      {
        meta: { currency: "USD", symbol: "EURUSD=X" },
        timestamp: [1725801600],
        indicators: { quote: [{ open: [1.08], high: [1.09], low: [1.07], close: [1.0888] }] },
      },
    ],
    error: null,
  },
});
const fx = await market.forex.history("EURUSD=X", { interval: "1d", range: "1mo" });
ok("forex history", fx.data[0].close === 1.0888 && fx.meta.currency === "USD");
responses.push({
  quoteResponse: { result: [{ symbol: "EURUSD=X", regularMarketPrice: 1.0888 }], error: null },
});
ok("forex quote", (await market.forex.quote("EURUSD=X")).data.price === 1.0888);
responses.push({
  chart: {
    result: [
      {
        meta: { currency: "USD", symbol: "BTC-USD" },
        timestamp: [1725801600],
        indicators: { quote: [{ open: [63000], high: [65000], low: [62000], close: [64000] }] },
      },
    ],
    error: null,
  },
});
ok("crypto history", (await market.crypto.history("BTC-USD")).data[0].close === 64000);
responses.push({
  quoteResponse: { result: [{ symbol: "BTC-USD", regularMarketPrice: 64000 }], error: null },
});
ok("crypto quote", (await market.crypto.quote("BTC-USD")).data.price === 64000);

// 14. chart error → NotFoundError
responses.push({
  chart: { result: null, error: { code: "Not Found", description: "No data found" } },
});
try {
  await market.stocks.history("NOSUCH");
  ok("chart 404 throws", false);
} catch (e) {
  ok("chart error -> NotFoundError", e instanceof NotFoundError);
}

// 15. HTTP statuses: 401 + 429 retry
responses.push([401, "Unauthorized"]);
try {
  await market.stocks.quote("AAPL");
  ok("401 throws", false);
} catch (e) {
  ok("401 -> AuthenticationError", e instanceof AuthenticationError);
}
responses.push([429, "Too Many Requests"], {
  quoteResponse: { result: [{ symbol: "AAPL", regularMarketPrice: 239.12 }], error: null },
});
const rq = await market.stocks.quote("AAPL");
ok("429 retried", rq.data.price === 239.12);

// 16. abort
{
  const controller = new AbortController();
  controller.abort();
  responses.push({ chart: { result: [], error: null } });
  try {
    await market.stocks.history("AAPL", { signal: controller.signal });
    ok("abort propagates", false);
  } catch (e) {
    ok("abort propagates", e.name === "AbortError");
  }
}

console.log(`\n${passed} checks passed, exit=${process.exitCode ?? 0}`);
