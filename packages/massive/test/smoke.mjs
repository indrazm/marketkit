import { Massive } from "../dist/index.js";
import { AuthenticationError, NotFoundError } from "@marketkit/core";

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

const market = new Massive({ apiKey: "demo", fetch: fetchMock });
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

// 1. aggs
responses.push({
  status: "OK",
  request_id: "req1",
  count: 2,
  next_url:
    "https://api.massive.com/v2/aggs/ticker/AAPL/range/1/day/2026-01-01/2026-09-08?cursor=abc",
  results: [
    { t: 1725715200000, o: 236, h: 238, l: 234, c: 237, v: 50000000 },
    { t: 1725801600000, o: 237, h: 240, l: 235, c: 239, v: 51234567, n: 123456, vw: 238.5 },
  ],
});
const a = await market.stocks.aggs("AAPL", {
  multiplier: 1,
  timespan: "day",
  from: "2026-01-01",
  to: "2026-09-08",
  limit: 2,
});
ok("aggs bars parsed", a.data[0].close === 239 && a.data[1].close === 237);
ok("aggs newest first", a.data[0].timestamp > a.data[1].timestamp);
ok(
  "aggs optional fields",
  a.data[0].volume === 51234567 && a.data[0].transactions === 123456 && a.data[0].vwap === 238.5,
);
ok(
  "aggs meta envelope",
  a.meta.provider === "massive" &&
    a.meta.requestId === "req1" &&
    a.meta.nextUrl?.includes("cursor=abc"),
);
ok(
  "aggs auth + params",
  calls.at(-1).includes("apiKey=demo") &&
    calls.at(-1).includes("limit=2") &&
    calls.at(-1).includes("v2/aggs/ticker/AAPL/range/1/day"),
);

// 2. follow next_url
responses.push({ status: "OK", results: [{ t: 1725628800000, o: 1, h: 2, l: 0.5, c: 1.5, v: 9 }] });
const next = await market.raw.next(a.meta.nextUrl);
ok("raw.next pagination", next.results[0].c === 1.5);

// 3. previous close
responses.push({
  status: "OK",
  results: [{ t: 1725715200000, o: 236, h: 238, l: 234, c: 237, v: 50000000 }],
});
const pc = await market.stocks.previousClose("AAPL");
ok("previousClose", pc.data[0].close === 237);

// 4. grouped daily
responses.push({
  status: "OK",
  results: [{ T: "AAPL", o: 1, c: 2, h: 2, l: 1, v: 100, t: 1725801600000 }],
});
const gd = await market.stocks.groupedDaily("us", "stocks", "2026-09-08");
ok("groupedDaily", gd.data[0].T === "AAPL" && gd.data[0].c === 2);

// 5. snapshots
responses.push({
  status: "OK",
  ticker: {
    ticker: "AAPL",
    todaysChange: 1.24,
    todaysChangePercent: 0.52,
    day: { o: "237", h: "240", l: "235", c: "239.12" },
  },
});
const sn = await market.stocks.snapshot("AAPL");
ok("snapshot", sn.data.ticker.todaysChange === 1.24 && sn.data.ticker.day.c === 239.12);
responses.push({ status: "OK", tickers: {} });
const fm = await market.stocks.fullMarketSnapshot();
ok("fullMarketSnapshot", fm.data.tickers !== undefined);
responses.push({ status: "OK", tickers: [] });
const mv = await market.stocks.movers("gainers");
ok("movers", mv.data.tickers !== undefined && calls.at(-1).includes("direction=gainers"));

// 6. last trade/quote
responses.push({
  status: "OK",
  results: { ticker: "AAPL", price: 239.12, size: 100, timestamp: 1725801600123 },
});
const lt = await market.stocks.lastTrade("AAPL");
ok("lastTrade", lt.data.price === 239.12);
responses.push({ status: "OK", results: { ticker: "AAPL", bid: 239.1, ask: 239.12 } });
const lq = await market.stocks.lastQuote("AAPL");
ok("lastQuote", lq.data.bid === 239.1);

// 7. dividends/splits/news
responses.push({
  status: "OK",
  results: [{ ticker: "AAPL", cash_amount: "0.25", ex_dividend_date: "2024-11-08" }],
});
const dv = await market.stocks.dividends({ ticker: "AAPL" });
ok("dividends", dv.data[0].cash_amount === 0.25);
responses.push({ status: "OK", results: [{ ticker: "AAPL", split_from: 1, split_to: 4 }] });
const sp = await market.stocks.splits({ ticker: "AAPL" });
ok("splits", sp.data[0].split_to === 4);
responses.push({
  status: "OK",
  results: [
    {
      id: 1,
      title: "T",
      article_url: "https://x",
      published_utc: "2026-09-08T00:00:00Z",
      tickers: ["AAPL"],
      publisher: { name: "Reuters" },
    },
  ],
});
const nw = await market.stocks.news({ ticker: "AAPL" });
ok(
  "news",
  nw.data[0].title === "T" &&
    nw.data[0].source === "Reuters" &&
    nw.data[0].publishedUtc instanceof Date,
);

// 8. reference
responses.push({
  status: "OK",
  results: [
    { ticker: "AAPL", name: "Apple Inc", market: "stocks", currency_name: "usd", active: true },
  ],
});
const tk = await market.reference.tickers({ search: "apple" });
ok(
  "reference tickers",
  tk.data[0].ticker === "AAPL" && tk.data[0].currency === "usd" && tk.data[0].active === true,
);
responses.push({ status: "OK", results: { ticker: "AAPL", name: "Apple Inc" } });
const td = await market.reference.ticker("AAPL");
ok("ticker detail", td.data.name === "Apple Inc");
responses.push({
  status: "OK",
  results: [{ asset_class: "stocks", code: "CS", description: "Common Stock" }],
});
const tt = await market.reference.tickerTypes();
ok("tickerTypes", tt.data[0].code === "CS");

// 9. market status/holidays
responses.push({ market: "closed", exchanges: "closed", serverTime: "2026-09-08T12:00:00Z" });
const st = await market.market.status();
ok("marketStatus", st.data.market === "closed");

// 10. options
responses.push({
  status: "OK",
  results: { abc: { details: { strike_price: 200, contract_type: "call" } } },
});
const oc = await market.options.chainSnapshot("AAPL");
ok("options chain snapshot", oc.data.results.abc.details.strike_price === 200);

// 11. forex + crypto + indices
responses.push({
  status: "OK",
  results: [{ t: 1725801600000, o: 1.08, h: 1.09, l: 1.07, c: 1.0888, v: 1000 }],
});
const fx = await market.forex.history("C:EURUSD", {
  multiplier: 1,
  timespan: "day",
  from: "2026-01-01",
  to: "2026-09-08",
});
ok("forex history", fx.data[0].close === 1.0888);
responses.push({
  status: "OK",
  results: [{ t: 1725801600000, o: 63000, h: 65000, l: 62000, c: 64000, v: 1234 }],
});
const ch = await market.crypto.history("X:BTCUSD", {
  multiplier: 1,
  timespan: "day",
  from: "2026-01-01",
  to: "2026-09-08",
});
ok("crypto history", ch.data[0].close === 64000);
responses.push({
  status: "OK",
  results: [{ t: 1725801600000, o: 5700, h: 5720, l: 5690, c: 5710 }],
});
const ix = await market.indices.history("I:SPX", {
  multiplier: 1,
  timespan: "day",
  from: "2026-01-01",
  to: "2026-09-08",
});
ok("indices history", ix.data[0].close === 5710);

// 12. indicators
responses.push({
  status: "OK",
  results: { values: [{ timestamp: "2026-09-08", value: 61.3 }] },
  url: "...",
});
const rsi = await market.indicators.rsi("AAPL", { period: 14 });
ok(
  "rsi indicator",
  rsi.data.results.values[0].value === 61.3 && calls.at(-1).includes("v1/indicators/AAPL/rsi"),
);

// 13. economy passthrough
responses.push({ status: "OK", results: [{ date: "2026-09-01", value: 4.2 }] });
const ty = await market.economy.get("treasury-yields", { limit: 10 });
ok(
  "economy passthrough",
  ty.data.results[0].value === 4.2 && calls.at(-1).includes("v1/economy/treasury-yields"),
);

// 13b. expanded REST coverage
responses.push({ status: "OK", symbol: "AAPL", open: 100, close: 101 });
ok("dailyOpenClose", (await market.stocks.dailyOpenClose("AAPL", "2026-09-08")).data.close === 101);
responses.push({ status: "OK", results: [{ price: 100 }] });
ok("stocks.trades", (await market.stocks.trades("AAPL")).data[0].price === 100);
responses.push({ status: "OK", results: [{ bid_price: 1 }] });
ok("stocks.quotes", (await market.stocks.quotes("AAPL")).data[0].bid_price === 1);
responses.push({ status: "OK", results: [{ ticker: "MSFT" }] });
ok("related", (await market.stocks.related("AAPL")).data[0].ticker === "MSFT");
responses.push({ status: "OK", results: [{ id: 1 }] });
ok("conditions", (await market.stocks.conditions()).data[0].id === 1);
responses.push({ status: "OK", results: [{ ticker: "AAPL" }] });
ok("unified", (await market.stocks.unified({ ticker: "AAPL" })).data[0].ticker === "AAPL");
responses.push({ status: "OK", results: [{ total_assets: 100 }] });
ok(
  "balanceSheets",
  (await market.stocks.balanceSheets({ tickers: "AAPL" })).data[0].total_assets === 100,
);
responses.push({ status: "OK", results: [{ ticker: "AAPL", free_float: 5 }] });
ok("float", (await market.stocks.float({ ticker: "AAPL" })).data[0].free_float === 5);
responses.push({ status: "OK", results: [{ ticker: "AAPL", short_interest: 7 }] });
ok(
  "shortInterest",
  (await market.stocks.shortInterest({ ticker: "AAPL" })).data[0].short_interest === 7,
);
responses.push({ status: "OK", results: [{ accession_number: "x", form_type: "10-K" }] });
ok(
  "filingsIndex",
  (await market.stocks.filingsIndex({ ticker: "AAPL" })).data[0].form_type === "10-K",
);
responses.push({ status: "OK", results: [{ ticker: "RAPP", ipo_status: "history" }] });
ok("ipos", (await market.stocks.ipos()).data[0].ticker === "RAPP");
responses.push({ status: "OK", results: [{ ticker: "O:AAPL1", contract_type: "call" }] });
ok(
  "options.contracts",
  (await market.options.contracts({ underlying_ticker: "AAPL" })).data[0].contract_type === "call",
);
responses.push({ status: "OK", results: { ticker: "O:AAPL1", strike_price: 100 } });
ok("options.contract", (await market.options.contract("O:AAPL1")).data.strike_price === 100);
responses.push({ status: "OK", results: [{ price: 1.5 }] });
ok("options.trades", (await market.options.trades("O:AAPL1")).data[0].price === 1.5);
responses.push({ converted: 73.14, status: "success" });
ok(
  "forex.conversion",
  (await market.forex.conversion("AUD", "USD", { amount: 100 })).data.converted === 73.14,
);
responses.push({ status: "success", last: { bid: 1.1, ask: 1.2 } });
ok("forex.lastQuote", (await market.forex.lastQuote("AUD", "USD")).data.last.bid === 1.1);
responses.push({ status: "OK", results: [{ ticker: "ESZ25" }] });
ok("futures.contracts", (await market.futures.contracts()).data[0].ticker === "ESZ25");
responses.push({ status: "OK", results: [{ product_code: "ES" }] });
ok("futures.products", (await market.futures.products()).data[0].product_code === "ES");
responses.push({ status: "OK", results: [{ date: "2026-09-01" }] });
ok("economy.treasuryYields", (await market.economy.treasuryYields()).data[0].date === "2026-09-01");
responses.push({ status: "OK", results: [{ title: "n" }] });
ok("partners.benzingaNews", (await market.partners.benzingaNews()).data[0].title === "n");

// 14. error mapping: 401 + 429 retry
responses.push([401, { status: "ERROR", message: "not authorized" }]);
try {
  await market.stocks.snapshot("AAPL");
  ok("401 throws", false);
} catch (e) {
  ok("401 -> AuthenticationError", e instanceof AuthenticationError);
}
responses.push([429, { status: "ERROR", message: "too many requests" }], {
  status: "OK",
  results: [{ t: 1725801600000, o: 1, h: 2, l: 0.5, c: 1.9, v: 5 }],
});
const retry = await market.stocks.previousClose("AAPL");
ok("429 retried", retry.data[0].close === 1.9);

// 15. no results -> NotFoundError
responses.push({ status: "NOT_FOUND" });
try {
  await market.stocks.snapshot("NOSUCH");
  ok("no results throws", false);
} catch (e) {
  ok("empty results -> NotFoundError", e instanceof NotFoundError);
}

// 16. abort
{
  const controller = new AbortController();
  controller.abort();
  responses.push({ status: "OK" });
  try {
    await market.stocks.snapshot("AAPL", { signal: controller.signal });
    ok("abort propagates", false);
  } catch (e) {
    ok("abort propagates", e.name === "AbortError");
  }
}

console.log(`\n${passed} checks passed, exit=${process.exitCode ?? 0}`);
