import { Finnhub } from "../dist/index.js";
import { NotFoundError } from "@marketkit/core";

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

const market = new Finnhub({ apiKey: "demo", fetch: fetchMock });
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

// 1. quote — cryptic keys decoded
responses.push({
  c: 239.12,
  d: 1.24,
  dp: 0.5213,
  h: 240,
  l: 235,
  o: 237,
  pc: 237.88,
  t: 1725801600,
});
const q = await market.stocks.quote("AAPL");
ok(
  "quote decoded",
  q.data.price === 239.12 && q.data.previousClose === 237.88 && q.data.changePercent === 0.5213,
);
ok("quote asOf Date", q.data.asOf instanceof Date && q.data.asOf.getUTCFullYear() === 2024);
ok(
  "quote url",
  calls.at(-1).includes("finnhub.io/api/v1/quote") && calls.at(-1).includes("token=demo"),
);

// 2. candles — column arrays → Candle[], newest first
responses.push({
  c: [239, 237],
  o: [237, 236],
  h: [240, 238],
  l: [235, 234],
  v: [51234567, 50000000],
  t: [1725801600, 1725715200],
  s: "ok",
});
const h = await market.stocks.history("AAPL", {
  resolution: "1day",
  from: "2026-01-01",
  to: "2026-09-08",
});
ok("history columns parsed", h.data[0].close === 239 && h.data[1].close === 237);
ok("history newest first", h.data[0].timestamp > h.data[1].timestamp);
ok(
  "history params",
  calls.at(-1).includes("resolution=D") && calls.at(-1).includes("from=1767225600"),
);

// 3. no_data → NotFoundError
responses.push({ s: "no_data" });
try {
  await market.stocks.history("BOGUS", { resolution: "1day", from: 0, to: 1 });
  ok("no_data throws", false);
} catch (e) {
  ok("candle no_data -> NotFoundError", e instanceof NotFoundError);
}

// 4. error payload classification
responses.push({ error: "Invalid API key" });
try {
  await market.stocks.quote("AAPL");
  ok("error payload throws", false);
} catch (e) {
  ok("{'error'} -> NotFoundError (payload)", e instanceof NotFoundError);
}

// 5. HTTP 429 retry
responses.push([429, { error: "rate limited" }], {
  c: 500,
  d: 1,
  dp: 0.2,
  h: 501,
  l: 499,
  o: 499.5,
  pc: 499,
  t: 1725801600,
});
const q2 = await market.stocks.quote("MSFT");
ok("429 retried", q2.data.price === 500);

// 6. search + symbols
responses.push({ result: [{ symbol: "AAPL", description: "Apple Inc", type: "Common Stock" }] });
const s = await market.stocks.search("apple");
ok("search", s.data[0].symbol === "AAPL" && s.data[0].name === "Apple Inc");
responses.push([
  200,
  [
    {
      symbol: "AAPL",
      description: "Apple Inc",
      currency: "USD",
      mic: "XNAS",
      figi: "BBG000B9XRY4",
    },
  ],
]);
const sy = await market.stocks.symbols("US");
ok("symbols", sy.data[0].micCode === "XNAS" && sy.data[0].currency === "USD");

// 7. market status + holiday + peers
responses.push({ exchange: "US", isOpen: true, session: "regular" });
const ms = await market.stocks.marketStatus("US");
ok("marketStatus", ms.data.isOpen === true && ms.data.exchange === "US");
responses.push({
  data: [{ exchange: "US", eventName: "Christmas", date: "2026-12-25", type: "holiday" }],
});
const mh = await market.stocks.marketHoliday("US");
ok("marketHoliday", mh.data[0].name === "Christmas");
responses.push([200, ["MSFT", "GOOG"]]);
const peers = await market.stocks.peers("AAPL");
ok("peers", peers.data[1] === "GOOG");

// 8. news
responses.push([
  200,
  [
    {
      category: "company",
      datetime: 1725801600,
      headline: "H",
      url: "https://x",
      source: "Y",
      summary: "S",
      related: "AAPL",
      id: 5,
    },
  ],
]);
const cn = await market.news.companyNews("AAPL", { from: "2026-09-01", to: "2026-09-08" });
ok("companyNews", cn.data[0].headline === "H" && cn.data[0].datetime instanceof Date);
responses.push([
  200,
  [
    {
      category: "general",
      datetime: 1725801600,
      headline: "M",
      url: "u",
      source: "s",
      summary: "",
      related: "",
      id: 1,
    },
  ],
]);
const mn = await market.news.marketNews("general");
ok("marketNews", mn.data[0].category === "general");
responses.push({
  buzz: 1.2,
  articlesInLastWeek: "50",
  bearishPercent: "0.2",
  bullishPercent: "0.6",
});
const ns = await market.news.sentiment("AAPL");
ok("news sentiment", ns.data.buzz === 1.2 && ns.data.bullishPercent === 0.6);

// 9. fundamentals
responses.push({
  symbol: "AAPL",
  name: "Apple Inc",
  country: "US",
  marketCapitalization: "3500000",
  ipo_date: "1980-12-12",
});
const pr = await market.fundamentals.profile("AAPL");
ok("profile", pr.data.marketCapitalization === 3500000 && pr.data.ipoDate === "1980-12-12");
responses.push({ metric: { peRatio: "35.2" } });
const mt = await market.fundamentals.metric("AAPL", "all");
ok("metric", mt.data.metric.peRatio === 35.2);
responses.push({ financials: [{ netIncome: "23000" }] });
const fin = await market.fundamentals.financials("AAPL", "ic", { freq: "quarterly" });
ok("financials", fin.data.financials[0].netIncome === 23000);
responses.push([
  200,
  [
    {
      symbol: "AAPL",
      actual: 1.4,
      estimate: 1.35,
      surprise: 0.05,
      surprisePercent: 3.7,
      period: "2026-06-30",
    },
  ],
]);
const es = await market.fundamentals.earningsSurprises("AAPL");
ok("earningsSurprises", es.data[0].surprise === 0.05);
responses.push([
  200,
  [
    {
      symbol: "AAPL",
      buy: 10,
      hold: 5,
      sell: 1,
      strongBuy: 20,
      strongSell: 0,
      period: "2026-09-01",
    },
  ],
]);
const rec = await market.fundamentals.recommendations("AAPL");
ok("recommendations", rec.data[0].strongBuy === 20);
responses.push({
  symbol: "AAPL",
  targetHigh: 300,
  targetMean: 250,
  targetLow: 200,
  numberOfAnalysts: 30,
});
const pt = await market.fundamentals.priceTarget("AAPL");
ok("priceTarget", pt.data.targetMean === 250 && pt.data.numberOfAnalysts === 30);
responses.push([
  200,
  [{ symbol: "AAPL", date: "2026-08-12", amount: "0.25", recordDate: "2026-08-12" }],
]);
const dv = await market.stocks.dividends("AAPL", { from: "2026-01-01", to: "2026-09-08" });
ok("dividends", dv.data[0].amount === 0.25 && dv.data[0].date instanceof Date);
responses.push([200, [{ symbol: "AAPL", date: "2020-08-31", fromFactor: 1, toFactor: 4 }]]);
const spl = await market.stocks.splits("AAPL", { from: "2020-01-01", to: "2026-09-08" });
ok("splits", spl.data[0].toFactor === 4);
responses.push({ symbol: "AAPL", data: [] });
const est = await market.fundamentals.estimate("eps", "AAPL");
ok("estimate passthrough", est.data.symbol === "AAPL");

// 10. forex + crypto
responses.push({ base: "USD", quote: { EUR: 0.92, JPY: 155.1 }, last_updated: "1725801600" });
const fr = await market.forex.rates("USD");
ok("forex rates", fr.data.rates.EUR === 0.92);
responses.push([200, ["oanda", "fxpro"]]);
const fx = await market.forex.exchanges();
ok("forex exchanges", fx.data[0] === "oanda");
responses.push([200, [{ symbol: "BTC/USD", base_currency: "BTC", quote_currency: "USD" }]]);
const cs = await market.crypto.symbols("Binance");
ok("crypto symbols", cs.data[0].symbol === "BTC/USD");
responses.push({
  c: [64000],
  o: [63000],
  h: [65000],
  l: [62000],
  v: [1234],
  t: [1725801600],
  s: "ok",
});
const ch = await market.crypto.history("BTC/USD", {
  resolution: "1day",
  from: "2026-09-01",
  to: "2026-09-08",
  exchange: "Binance",
});
ok("crypto history", ch.data[0].close === 64000 && calls.at(-1).includes("exchange=Binance"));

// 11. calendars + economy + index
responses.push({ earningsCalendar: [{ symbol: "AAPL", date: "2026-10-30", epsEstimate: 1.6 }] });
const ec = await market.calendar.earningsCalendar({ from: "2026-10-30", to: "2026-10-31" });
ok("earningsCalendar", ec.data.earningsCalendar[0].symbol === "AAPL");
responses.push({ data: [{ code: "GDP", country: "US", name: "GDP" }] });
const codes = await market.economy.codes();
ok("economy codes", codes.data[0].code === "GDP");
responses.push({ symbol: "^GSPC", constituents: ["AAPL", "MSFT"] });
const idx = await market.index.constituents("^GSPC");
ok("index constituents", idx.data.constituents[0] === "AAPL");

// 12. indicator
responses.push({ c: [239, 237], t: [1725801600, 1725715200], rsi: [61.3, 60.1], s: "ok" });
const ind = await market.indicators.get("rsi", {
  symbol: "AAPL",
  resolution: "1day",
  from: "2026-01-01",
  to: "2026-09-08",
  period: 14,
});
ok(
  "indicator",
  ind.data.rsi[0] === 61.3 &&
    calls.at(-1).includes("indicator=rsi") &&
    calls.at(-1).includes("timeperiod=14"),
);

// 13. raw passthrough + abort
responses.push({ anything: true });
const raw = await market.raw.get("", { foo: "bar" });
ok("raw passthrough", raw.anything === true && calls.at(-1).includes("foo=bar"));
{
  const controller = new AbortController();
  controller.abort();
  responses.push({ c: 1 });
  try {
    await market.stocks.quote("AAPL", { signal: controller.signal });
    ok("abort propagates", false);
  } catch (e) {
    ok("abort propagates", e.name === "AbortError");
  }
}

console.log(`\n${passed} checks passed, exit=${process.exitCode ?? 0}`);
