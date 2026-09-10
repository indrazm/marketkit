import { AlphaVantage } from "../dist/index.js";
import { RateLimitError, InvalidRequestError } from "@marketkit/core";

const responses = [];
let calls = [];

const fetchMock = async (url, init) => {
  calls.push(url);
  if (init?.signal?.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }
  const next = responses.shift();
  if (!next) throw new Error("no scripted response for " + url);
  const [status, body, headers] = Array.isArray(next) ? next : [200, next];
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    headers: { get: (h) => (headers ?? {})[h.toLowerCase()] ?? null },
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    json: async () => body,
  };
};

const market = new AlphaVantage({ apiKey: "demo", fetch: fetchMock });
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

// 1. quote
responses.push({
  "Meta Data": {
    "1. Information": "...",
    "2. Symbol": "AAPL",
    "3. Last Refreshed": "2026-09-08",
    "4. Time Zone": "EDT",
  },
  "Global Quote": {
    "01. symbol": "AAPL",
    "02. open": "237.00",
    "03. high": "240.00",
    "04. low": "235.00",
    "05. price": "239.12",
    "06. volume": "51234567",
    "07. latest trading day": "2026-09-08",
    "08. previous close": "237.88",
    "09. change": "1.24",
    "10. change percent": "0.5213%",
  },
});
const q = await market.stocks.quote("AAPL");
ok("quote.price is number", q.data.price === 239.12);
ok("quote.changePercent parsed from %", q.data.changePercent === 0.5213);
ok("quote.meta.symbol", q.meta.symbol === "AAPL");
ok("quote.meta.provider", q.meta.provider === "alphavantage");
ok("quote.meta.fetchedAt Date", q.meta.fetchedAt instanceof Date);

// 2. history daily adjusted
responses.push({
  "Meta Data": { "2. Symbol": "AAPL", "3. Last Refreshed": "2026-09-08", "4. Time Zone": "EDT" },
  "Time Series (Daily)": {
    "2026-09-08": {
      "1. open": "237.00",
      "2. high": "240.00",
      "3. low": "235.00",
      "4. close": "239.00",
      "5. adjusted close": "239.00",
      "6. volume": "51234567",
      "7. dividend amount": "0.25",
      "8. split coefficient": "1.0",
    },
    "2026-09-07": {
      "1. open": "236.00",
      "2. high": "238.00",
      "3. low": "234.00",
      "4. close": "237.00",
      "5. adjusted close": "237.00",
      "6. volume": "50000000",
      "7. dividend amount": "0.00",
      "8. split coefficient": "1.0",
    },
  },
});
const h = await market.stocks.history("AAPL", { interval: "1d", adjusted: true });
ok("history url uses ADJUSTED", calls.at(-1).includes("TIME_SERIES_DAILY_ADJUSTED"));
ok("history newest first", h.data[0].close === 239.0 && h.data[1].close === 237.0);
ok("history candle adjustedClose", h.data[0].adjustedClose === 239.0);
ok("history dividend", h.data[0].dividend === 0.25);
ok("history meta interval", h.meta.interval === "1d" && h.meta.adjusted === true);

// 3. intraday routing
responses.push({
  "Meta Data": {},
  "Time Series (5min)": {
    "2026-09-08 16:00:00": {
      "1. open": "1",
      "2. high": "1",
      "3. low": "1",
      "4. close": "1",
      "5. volume": "10",
    },
  },
});
await market.stocks.history("AAPL", { interval: "5m" });
ok(
  "intraday url",
  calls.at(-1).includes("TIME_SERIES_INTRADAY") && calls.at(-1).includes("interval=5min"),
);

// 4. rate limit Note -> RateLimitError
responses.push({
  Note: "Thank you for using Alpha Vantage! Our standard API call frequency is 5 requests per minute.",
});
try {
  await market.stocks.quote("AAPL");
  ok("rate limit throws", false);
} catch (e) {
  ok("Note -> RateLimitError", e instanceof RateLimitError);
}

// 5. error message -> InvalidRequestError
responses.push({ "Error Message": "Invalid API call. Please retry or visit documentation." });
try {
  await market.stocks.quote("BOGUS");
  ok("invalid throws", false);
} catch (e) {
  ok("Error Message -> InvalidRequestError", e instanceof InvalidRequestError);
}

// 6. retry on 429 then success
responses.push([429, "rate limited", { "retry-after": "1" }], {
  "Global Quote": {
    "01. symbol": "MSFT",
    "02. open": "1",
    "03. high": "1",
    "04. low": "1",
    "05. price": "2",
    "06. volume": "3",
    "07. latest trading day": "2026-09-08",
    "08. previous close": "1",
    "09. change": "1",
    "10. change percent": "100%",
  },
});
const q2 = await market.stocks.quote("MSFT");
ok("429 retried", q2.data.price === 2 && calls.at(-1).includes("MSFT"));

// 7. search
responses.push({
  bestMatches: [
    {
      "1. symbol": "AAPL",
      "2. name": "Apple Inc",
      "3. type": "Equity",
      "4. region": "US",
      "5. marketOpen": "09:30",
      "6. marketClose": "16:00",
      "7. timezone": "ETZ",
      "8. currency": "USD",
      "9. matchScore": "1.0000",
    },
  ],
});
const s = await market.stocks.search("apple");
ok(
  "search instrument",
  s.data[0].symbol === "AAPL" && s.data[0].name === "Apple Inc" && s.data[0].matchScore === 1,
);

// 8. news
responses.push({
  feed: [
    {
      title: "T",
      url: "https://x",
      time_published: "20260908T120000",
      source: "Src",
      summary: "S",
      overall_sentiment_score: "0.12",
      overall_sentiment_label: "Bullish",
      ticker_sentiment: [
        {
          ticker: "AAPL",
          relevance_score: "0.5",
          ticker_sentiment_score: "0.3",
          ticker_sentiment_label: "Bullish",
        },
      ],
    },
  ],
});
const n = await market.news.search({ symbols: ["AAPL"], from: new Date("2026-09-01") });
ok("news publishedAt Date", n.data[0].publishedAt.getUTCHours() === 12);
ok(
  "news sentiment",
  n.data[0].sentiment?.score === 0.12 && n.data[0].sentiment?.label === "Bullish",
);
ok(
  "news tickers",
  n.data[0].tickers?.[0].symbol === "AAPL" && n.data[0].tickers?.[0].relevance === 0.5,
);
ok("news time_from param", calls.at(-1).includes("time_from=20260901T000000"));

// 9. earnings calendar (CSV)
responses.push(
  "symbol,name,reportDate,fiscalDateEnding,EPSestimate,currency\nAAPL,Apple Inc,20261030,20260930,1.60,USD\n",
);
const ec = await market.fundamentals.earningsCalendar();
ok("earningsCalendar CSV", ec.data[0].symbol === "AAPL" && ec.data[0].EPSestimate === 1.6);

// 10. indicators macd
responses.push({
  "Meta Data": { "2. Symbol": "AAPL" },
  "Technical Analysis: MACD": {
    "2026-09-08": { MACD: "1.5", MACD_Signal: "1.2", MACD_Hist: "0.3" },
    "2026-09-07": { MACD: "1.4", MACD_Signal: "1.3", MACD_Hist: "0.1" },
  },
});
const m = await market.indicators.macd({ symbol: "AAPL", interval: "1d" });
ok("macd point", m.data[0].macd === 1.5 && m.data[0].histogram === 0.3);

// 11. rsi via get
responses.push({
  "Meta Data": { "2. Symbol": "AAPL" },
  "Technical Analysis: RSI": { "2026-09-08": { RSI: "61.3" } },
});
const r = await market.indicators.get("rsi", { symbol: "AAPL", interval: "1d", period: 14 });
ok("rsi via get", r.data[0].value === 61.3);
ok(
  "rsi url params",
  calls.at(-1).includes("function=RSI") &&
    calls.at(-1).includes("time_period=14") &&
    calls.at(-1).includes("interval=daily"),
);

// 12. forex quote
responses.push({
  "Realtime Currency Exchange Rate": {
    "1. From_Currency Code": "EUR",
    "3. To_Currency Code": "USD",
    "5. Exchange Rate": "1.0888",
    "6. Last Refreshed": "2026-09-08 17:00:00",
    "8. Bid Price": "1.0887",
    "9. Ask Price": "1.0889",
    "4. Time Zone": "UTC",
  },
});
const f = await market.forex.quote({ from: "EUR", to: "USD" });
ok(
  "forex quote",
  f.data.rate === 1.0888 && f.data.from === "EUR" && f.data.refreshedAt instanceof Date,
);

// 13. forex history from string pair
responses.push({
  "Time Series FX (Daily)": {
    "2026-09-08": {
      "1. open": "1.08",
      "2. high": "1.09",
      "3. low": "1.07",
      "4. close": "1.0888",
      "5. volume": "-",
    },
  },
});
const fh = await market.forex.history("EUR/USD", { interval: "1d" });
ok("forex history", fh.data[0].close === 1.0888 && calls.at(-1).includes("FX_DAILY"));
ok("forex volume '-' becomes undefined, not string", fh.data[0].volume === undefined);

// 14. crypto quote
responses.push({
  "Realtime Currency Exchange Rate": {
    "1. From_Currency Code": "BTC",
    "3. To_Currency Code": "USD",
    "5. Exchange Rate": "64000.5",
    "6. Last Refreshed": "2026-09-08 17:00:00",
  },
});
const c = await market.crypto.quote({ symbol: "BTC", currency: "USD" });
ok("crypto quote", c.data.rate === 64000.5 && c.data.currency === "USD");

// 15. crypto history picks currency close
responses.push({
  "Time Series (Digital Currency Daily)": {
    "2026-09-08": {
      "1a. open (USD)": "63000",
      "1b. open (EUR)": "58000",
      "2a. high (USD)": "65000",
      "2b. high (EUR)": "59000",
      "3a. low (USD)": "62000",
      "3b. low (EUR)": "57000",
      "4a. close (USD)": "64000.5",
      "4b. close (EUR)": "59500",
      "5. volume": "1234",
      "6. market cap (USD)": "1e6",
    },
  },
});
const ch = await market.crypto.history({ symbol: "BTC", currency: "USD" });
ok("crypto history close(USD)", ch.data[0].close === 64000.5);

// 16. market status
responses.push({
  endpoint: "MARKET_STATUS",
  markets: [
    {
      market_type: "Equity",
      region: "US",
      primary_exchanges: "NASDAQ, NYSE",
      local_open: "09:30",
      local_close: "16:00",
      current_status: "open",
      notes: "",
    },
  ],
});
const ms = await market.market.status();
ok("market.status", ms.data[0].marketType === "Equity" && ms.data[0].currentStatus === "open");

// 17. raw pass-through
responses.push({ anything: true });
const raw = await market.raw.request({ function: "SOME_UNKNOWN_FUNCTION", symbol: "X" });
ok(
  "raw passthrough",
  raw.anything === true &&
    calls.at(-1).includes("function=SOME_UNKNOWN_FUNCTION") &&
    calls.at(-1).includes("apikey=demo"),
);

// 18. abort signal propagates
{
  const controller = new AbortController();
  controller.abort();
  try {
    await market.stocks.quote("AAPL", { signal: controller.signal });
    ok("abort propagates", false);
  } catch (e) {
    ok("abort propagates", e.name === "AbortError");
  }
}

// 19. empty GLOBAL_QUOTE -> NotFoundError
{
  const { NotFoundError } = await import("@marketkit/core");
  responses.push({});
  try {
    await market.stocks.quote("NOSUCH");
    ok("empty quote -> NotFoundError", false);
  } catch (e) {
    ok("empty quote -> NotFoundError", e instanceof NotFoundError);
  }
}

// ── Coverage: 130-endpoint parity suite ──────────────────────────────────────

// 20. bulk bid & ask
responses.push({
  "Intraday Prices": [{ symbol: "AAPL", bid: "100.1", ask: "100.2", bid_size: "5", ask_size: "7" }],
});
const ba = await market.stocks.bidAsk(["AAPL"]);
ok("bidAsk rows normalized", ba.data[0].bid === 100.1 && ba.data[0].bidSize === 5);

// 20b. bulk quotes alternative-keyword matching (field() regression)
responses.push({
  "Intraday Prices": [
    { symbol: "MSFT", last: "500.5", previous_close: "498", change: "2.5", change_percent: "0.5%" },
  ],
});
const bq = await market.stocks.quotes(["MSFT"]);
ok(
  "bulk quotes last/close fallback",
  bq.data[0].price === 500.5 && bq.data[0].previousClose === 498,
);

// 20c. crypto intraday routing
responses.push({
  "Time Series Crypto (5min)": {
    "2026-09-08 16:00:00": {
      "1. open": "64000",
      "2. high": "64100",
      "3. low": "63900",
      "4. close": "64050",
      "5. volume": "12",
    },
  },
});
const ci = await market.crypto.history({ symbol: "BTC", currency: "USD", interval: "5m" });
ok(
  "crypto intraday",
  ci.data[0].close === 64050 &&
    calls.at(-1).includes("CRYPTO_INTRADAY") &&
    calls.at(-1).includes("interval=5min"),
);

// 21. top movers
responses.push({
  last_updated: "2026-09-08",
  top_gainers: [
    { ticker: "G", price: "10", change_amount: "1", change_percentage: "10%", volume: "999" },
  ],
  top_losers: [],
  most_actively_traded: {
    ticker: "A",
    price: "5",
    change_amount: "0.1",
    change_percentage: "2%",
    volume: "12",
  },
});
const tm = await market.stocks.topMovers();
ok("topMovers", tm.data.topGainers[0].ticker === "G" && tm.data.mostActivelyTraded?.ticker === "A");

// 22. index history + catalog
responses.push({
  "Time Series (Weekly)": {
    "2026-09-04": { "1. open": "1", "2. high": "2", "3. low": "0.5", "4. close": "1.7" },
  },
});
const ih = await market.indexes.history("DJI", "weekly");
ok("index history", ih.data[0].close === 1.7);
responses.push({ data: [{ domain: "Dow Jones Industrial Average", symbol: "DJI" }] });
const ic = await market.indexes.catalog();
ok("index catalog", ic.data[0].symbol === "DJI");

// 23. options ratios
responses.push({ symbol: "IBM", put_call_ratio: "0.7" });
const pcr = await market.options.putCallRatio({ symbol: "IBM" });
ok("putCallRatio realtime", pcr.data.putCallRatio === 0.7);
responses.push({ symbol: "IBM", put_call_ratio: "0.9" });
const pcrH = await market.options.putCallRatio({
  symbol: "IBM",
  historical: true,
  date: "2026-03-12",
});
ok(
  "putCallRatio historical",
  pcrH.data.putCallRatio === 0.9 && calls.at(-1).includes("HISTORICAL_PUT_CALL_RATIO"),
);
responses.push({ symbol: "NVDA", ratio: "1.2" });
const voi = await market.options.volumeToOpenInterest({ symbol: "NVDA" });
ok("volumeToOI", voi.data.ratio === 1.2);

// 24. intelligence
responses.push({ symbol: "IBM", quarter: "2024Q1", transcript: "hello world" });
const tr = await market.intelligence.transcript({
  symbol: "IBM",
  quarter: { year: 2024, quarter: 1 },
});
ok("transcript", tr.data.quarter === "2024Q1" && tr.data.transcript === "hello world");
responses.push({
  symbol: "IBM",
  data: [
    {
      symbol: "IBM",
      acquisition_or_disposal: "A",
      transaction_date: "2026-03-05",
      shares_traded: "1000",
    },
  ],
});
const it = await market.intelligence.insiderTransactions({ symbol: "IBM" });
ok("insiderTransactions", it.data.data[0].sharesTraded === 1000);
responses.push({ trades: [{ politician: "Nancy Pelosi", symbol: "AAPL" }] });
const ct = await market.intelligence.congressTrades({ symbol: "AAPL" });
ok("congressTrades", Array.isArray(ct.data.trades) && ct.data.trades[0].symbol === "AAPL");
responses.push({ politicians: [{ name: "X", bioguide_id: "X1" }] });
const pm = await market.intelligence.politicianMetadata();
ok("politicianMetadata", pm.data.politicians[0].bioguideId === "X1");
responses.push({ symbol: "IBM", holdings: [{ holder: "Vanguard", shares: "70000000" }] });
const ih2 = await market.intelligence.institutionalHoldings("IBM");
ok("institutionalHoldings", ih2.data.holdings[0].shares === 70000000);

// 25. analytics fixed + sliding
responses.push({
  meta: { symbols: ["AAPL", "MSFT"] },
  data: { AAPL: { mean: "0.01" }, MSFT: { mean: "0.02" } },
});
const an = await market.intelligence.analytics({
  symbols: ["AAPL", "MSFT"],
  range: "6month",
  interval: "1d",
  calculations: "MEAN",
});
ok(
  "analytics fixed",
  calls.at(-1).includes("ANALYTICS_FIXED_WINDOW") && an.data.data.AAPL.mean === 0.01,
);
responses.push({ data: { AAPL: { stddev: "0.2" } } });
const _an2 = await market.intelligence.analytics({
  symbols: ["AAPL"],
  range: ["2023-07-01", "2023-08-31"],
  interval: "1d",
  calculations: "STDDEV(annualized=True)",
  window: 60,
});
ok(
  "analytics sliding",
  calls.at(-1).includes("ANALYTICS_SLIDING_WINDOW") &&
    calls.at(-1).includes("WINDOW=60") &&
    calls.at(-1).includes("RANGE=2023-07-01"),
);

// 26. fundamentals coverage
responses.push({ logo: "https://logo" });
const lg = await market.fundamentals.logo("IBM");
ok("logo", lg.data.url === "https://logo");
responses.push({ etf_name: "Invesco QQQ", net_expense_ratio: "0.20", holdings: [] });
const ep = await market.fundamentals.etfProfile("QQQ");
ok("etfProfile", ep.data.etfName === "Invesco QQQ");
responses.push({ symbol: "IBM", data: [{ effective_date: "2026-02-10", amount: "1.66" }] });
const dv = await market.fundamentals.dividends("IBM");
ok(
  "dividends",
  dv.data.events[0].amount === 1.66 && dv.data.events[0].effectiveDate instanceof Date,
);
responses.push({ symbol: "IBM", data: [{ effective_date: "1999-05-27", split_ratio: "2:1" }] });
const sp = await market.fundamentals.splits("IBM");
ok("splits", sp.data.events[0].ratio === "2:1");
responses.push({
  symbol: "MSFT",
  data: [{ fiscal_date_ending: "2026-06-30", shares: "7400000000" }],
});
const so = await market.fundamentals.sharesOutstanding("MSFT");
ok("sharesOutstanding", so.data.data[0].shares === 7400000000);
responses.push({ symbol: "IBM", quarterly_estimates: [] });
const ee = await market.fundamentals.earningsEstimates("IBM");
ok("earningsEstimates", ee.data.quarterlyEstimates !== undefined);
responses.push(
  "symbol,name,exchange,assetType,ipoDate,delistingDate,status\nAAPL,Apple Inc,NASDAQ,Stock,1980-12-12,,Active\n",
);
const ls = await market.fundamentals.listingStatus();
ok("listingStatus CSV", ls.data[0].symbol === "AAPL" && ls.data[0].assetType === "Stock");

// 27. commodities
responses.push({ name: "Gold Spot", price: "2400.5", updated: "2026-09-08" });
const gs = await market.commodities.spot("gold");
ok("gold spot", gs.data.price === 2400.5);
responses.push({
  name: "Silver",
  interval: "daily",
  unit: "USD",
  data: [{ date: "2026-09-08", value: "28.1" }],
});
const si = await market.commodities.history("silver", { interval: "daily" });
ok("silver history", si.data.data[0].value === 28.1);
responses.push({
  name: "Crude Oil Prices: WTI",
  interval: "monthly",
  unit: "USD",
  data: [{ date: "2026-08", value: "79.46" }],
});
const wti = await market.commodities.history("wti");
ok(
  "wti history default monthly",
  wti.data.data[0].value === 79.46 && calls.at(-1).includes("function=WTI"),
);

// 28. economy
responses.push({
  name: "Real GDP",
  interval: "quarterly",
  unit: "billions of dollars",
  data: [{ date: "2026-07-01", value: "23000.1" }],
});
const gdp = await market.economy.realGdp({ interval: "quarterly" });
ok("realGdp", gdp.data.data[0].value === 23000.1);
responses.push({
  name: "10-Year Treasury",
  interval: "monthly",
  unit: "%",
  data: [{ date: "2026-08", value: "4.2" }],
});
const ty = await market.economy.treasuryYield({ maturity: "10year" });
ok("treasuryYield", ty.data.data[0].value === 4.2 && calls.at(-1).includes("maturity=10year"));
responses.push({ name: "Federal Funds Rate", data: [{ date: "2026-08", value: "5.3" }] });
const ffr = await market.economy.federalFundsRate();
ok("federalFundsRate", ffr.data.data[0].value === 5.3);
responses.push({ name: "CPI", data: [{ date: "2026-08", value: "310.5" }] });
const cpi = await market.economy.cpi();
ok("cpi", cpi.data.data[0].value === 310.5);
responses.push({ name: "Unemployment", data: [{ date: "2026-08", value: "4.2" }] });
const ue = await market.economy.unemployment();
ok("unemployment", ue.data.data[0].value === 4.2);

// 29. shaped stoch indicator
responses.push({
  "Meta Data": { "2. Symbol": "AAPL" },
  "Technical Analysis: STOCH": { "2026-09-08": { SlowK: "80.1", SlowD: "75.3" } },
});
const st = await market.indicators.stoch({ symbol: "AAPL", interval: "1d" });
ok("stoch shaped", st.data[0].k === 80.1 && st.data[0].d === 75.3);

// 30. intraday extras + entitlement params
responses.push({
  "Meta Data": {},
  "Time Series (5min)": {
    "2026-09-08 16:00:00": {
      "1. open": "1",
      "2. high": "1",
      "3. low": "1",
      "4. close": "1",
      "5. volume": "10",
    },
  },
});
await market.stocks.history("AAPL", {
  interval: "5m",
  extendedHours: false,
  month: "2009-01",
  entitlement: "realtime",
});
ok(
  "intraday extras",
  calls.at(-1).includes("extended_hours=false") &&
    calls.at(-1).includes("month=2009-01") &&
    calls.at(-1).includes("entitlement=realtime"),
);

console.log(`\n${passed} checks passed, exit=${process.exitCode ?? 0}`);
