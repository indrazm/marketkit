import { TwelveData } from "../dist/index.js";
import { AuthenticationError, RateLimitError, NotFoundError } from "@marketkit/core";

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

const market = new TwelveData({ apiKey: "demo", fetch: fetchMock });
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

const quoteBody = {
  symbol: "AAPL",
  name: "Apple Inc",
  exchange: "NASDAQ",
  currency: "USD",
  open: "237",
  high: "240",
  low: "235",
  close: "239.12",
  previous_close: "237.88",
  change: "1.24",
  percent_change: "0.5213",
  volume: "51234567",
  average_volume: "60000000",
  is_market_open: "true",
  datetime: "2026-09-08",
  fifty_two_week: {
    low: "164",
    high: "260",
    low_change: "75.12",
    high_change: "-20.88",
    range: "164 - 260",
  },
};

// 1. quote
responses.push(quoteBody);
const q = await market.stocks.quote("AAPL");
ok("quote numbers coerced", q.data.price === 239.12 && q.data.previousClose === 237.88);
ok("quote changePercent", q.data.changePercent === 0.5213);
ok(
  "quote meta",
  q.meta.provider === "twelvedata" && q.meta.symbol === "AAPL" && q.meta.exchange === "NASDAQ",
);
ok("quote 52w", q.data.fiftyTwoWeek?.low === 164 && q.data.fiftyTwoWeek?.range === "164 - 260");
ok(
  "quote url",
  calls.at(-1).includes("api.twelvedata.com/quote") && calls.at(-1).includes("apikey=demo"),
);

// 2. price + last change
responses.push({ price: "239.12" });
const p = await market.stocks.price("AAPL");
ok("price", p.data === 239.12);
responses.push({ change: "1.24" });
const lc = await market.stocks.lastChange("AAPL");
ok("lastChange", lc.data === 1.24);

// 3. history
responses.push({
  meta: { symbol: "AAPL", interval: "1day", currency: "USD", exchange: "NASDAQ" },
  values: [
    {
      datetime: "2026-09-08",
      open: "237",
      high: "240",
      low: "235",
      close: "239",
      volume: "51234567",
    },
    {
      datetime: "2026-09-07",
      open: "236",
      high: "238",
      low: "234",
      close: "237",
      volume: "50000000",
    },
  ],
  status: "ok",
});
const h = await market.stocks.history("AAPL", { interval: "1day", startDate: "2026-01-01" });
ok("history newest first", h.data[0].close === 239 && h.data[1].close === 237);
ok("history volume coerced", h.data[0].volume === 51234567);
ok("history meta interval", h.meta.interval === "1day");
ok(
  "history params",
  calls.at(-1).includes("start_date=2026-01-01") && calls.at(-1).includes("interval=1day"),
);

// 4. history volume optional (FX-style)
responses.push({
  values: [{ datetime: "2026-09-08", open: "1.08", high: "1.09", low: "1.07", close: "1.0888" }],
});
const fx = await market.stocks.history("EUR/USD", { interval: "1day" });
ok("history volume optional", fx.data[0].volume === undefined);

// 5. eod + search
responses.push({
  values: [
    {
      datetime: "2026-09-08",
      open: "237",
      high: "240",
      low: "235",
      close: "239",
      volume: "51234567",
    },
  ],
});
const eod = await market.stocks.eod("AAPL");
ok("eod", eod.data[0].close === 239);
responses.push({
  data: [
    {
      symbol: "AAPL",
      instrument_name: "Apple Inc",
      exchange: "NASDAQ",
      instrument_type: "Common Stock",
    },
  ],
  result_count: 1,
});
const s = await market.stocks.search("apple");
ok(
  "search",
  s.data[0].symbol === "AAPL" &&
    s.data[0].name === "Apple Inc" &&
    s.data[0].type === "Common Stock",
);

// 6. market state + movers
responses.push({ markets: [{ market: "NYSE", current_status: "open", local_open: "09:30" }] });
const ms = await market.stocks.marketState();
ok("marketState", ms.data[0].market === "NYSE" && ms.data[0].current_status === "open");
responses.push({
  last_updated: "2026-09-08",
  top_gainers: [{ symbol: "G", close: "10", percent_change: "10", volume: "999" }],
  top_losers: [],
});
const mv = await market.stocks.movers();
ok("movers", mv.data.topGainers[0].symbol === "G" && mv.data.topGainers[0].close === 10);

// 7. payload error classification
responses.push({ code: 429, message: "You have run out of credits", status: "error" });
try {
  await market.stocks.quote("AAPL");
  ok("rate limit throws", false);
} catch (e) {
  ok("429 payload -> RateLimitError", e instanceof RateLimitError);
}
responses.push({ code: 401, message: "Invalid API key", status: "error" });
try {
  await market.stocks.quote("AAPL");
  ok("auth throws", false);
} catch (e) {
  ok("401 payload -> AuthenticationError", e instanceof AuthenticationError);
}
responses.push({ code: 404, message: "**symbol** not found: NOSUCH", status: "error" });
try {
  await market.stocks.quote("NOSUCH");
  ok("not found throws", false);
} catch (e) {
  ok("symbol not found -> NotFoundError", e instanceof NotFoundError);
}

// 8. retry on HTTP 429 then success
responses.push([429, "rate limited", { "retry-after": "1" }], { ...quoteBody, symbol: "MSFT" });
const q2 = await market.stocks.quote("MSFT");
ok("429 retried", q2.data.symbol === "MSFT");

// 9. fundamentals
responses.push({
  symbol: "AAPL",
  name: "Apple Inc",
  exchange: "NASDAQ",
  currency: "USD",
  country: "US",
  ipo_date: "1980-12-12",
});
const pr = await market.fundamentals.profile("AAPL");
ok("profile", pr.data.name === "Apple Inc" && pr.data.ipo_date === "1980-12-12");
responses.push({ logo: "https://logo", background: "#000" });
const lg = await market.fundamentals.logo("AAPL");
ok("logo", lg.data.url === "https://logo" && lg.data.background === "#000");
responses.push({
  symbol: "AAPL",
  income_statement: [
    { fiscal_date: "2026-06-30", total_revenue: "90000000", net_income: "23000000" },
  ],
});
const inc = await market.fundamentals.incomeStatement({ symbol: "AAPL", period: "annual" });
ok(
  "incomeStatement",
  inc.data.reports[0].total_revenue === 90000000 && inc.data.reports[0].fiscalDate instanceof Date,
);
responses.push({
  symbol: "AAPL",
  earnings: [
    {
      date: "2026-08-01",
      eps_actual: "1.4",
      eps_estimate: "1.35",
      before_after_market: "after market",
    },
  ],
});
const ea = await market.fundamentals.earnings("AAPL");
ok(
  "earnings",
  ea.data.earnings[0].epsActual === 1.4 && ea.data.earnings[0].beforeAfterMarket === "after market",
);
responses.push({
  symbol: "AAPL",
  dividends: [{ ex_date: "2026-08-12", amount: "0.25", payment_date: "2026-08-15" }],
});
const dv = await market.fundamentals.dividends("AAPL");
ok(
  "dividends",
  dv.data.dividends[0].amount === 0.25 && dv.data.dividends[0].exDate instanceof Date,
);
responses.push({
  symbol: "AAPL",
  splits: [{ date: "2020-08-31", split_ratio: "4:1", split_to: "4", split_from: "1" }],
});
const sp = await market.fundamentals.splits("AAPL");
ok("splits", sp.data.splits[0].ratio === "4:1" && sp.data.splits[0].splitTo === 4);
responses.push({ symbol: "AAPL", market_cap: "3500000000000" });
const mc = await market.fundamentals.marketCap("AAPL");
ok("marketCap", mc.data === 3500000000000);
responses.push({ symbol: "AAPL", pe_ratio: "35" });
const st = await market.fundamentals.statistics("AAPL");
ok("statistics passthrough", st.data.pe_ratio === 35);
responses.push({ symbol: "AAPL", target_high: "300" });
const pt = await market.fundamentals.priceTarget("AAPL");
ok("priceTarget", pt.data.target_high === 300);
responses.push({ symbol: "AAPL", holdings: [{ holder: "Vanguard", shares: "100" }] });
const ins = await market.fundamentals.institutionalHolders("AAPL");
ok("institutionalHolders", ins.data.holdings[0].shares === 100);

// 10. forex
responses.push({ symbol: "EUR/USD", rate: "1.0888", datetime: "2026-09-08 17:00:00" });
const fr = await market.forex.rate({ from: "EUR", to: "USD" });
ok("forex rate", fr.data.rate === 1.0888 && fr.data.asOf instanceof Date);
responses.push({
  values: [{ datetime: "2026-09-08", open: "1.08", high: "1.09", low: "1.07", close: "1.0888" }],
});
const fh = await market.forex.history("EUR/USD", { interval: "1day" });
ok(
  "forex history",
  fh.data[0].close === 1.0888 && calls.at(-1).includes("forex_pairs/time_series"),
);

// 11. crypto
responses.push({ price: "64000.5" });
const cp = await market.crypto.price("BTC/USD");
ok("crypto price", cp.data.rate === 64000.5);
responses.push({
  values: [
    {
      datetime: "2026-09-08",
      open: "63000",
      high: "65000",
      low: "62000",
      close: "64000",
      volume: "1234",
    },
  ],
});
const ch = await market.crypto.history("BTC/USD", { interval: "1h", exchange: "Binance" });
ok("crypto history", ch.data[0].close === 64000 && calls.at(-1).includes("exchange=Binance"));

// 12. commodities
responses.push({ data: { WTI: "Crude Oil WTI", XAU: "Gold" } });
const cl = await market.commodities.list();
ok("commodities list", cl.data.WTI === "Crude Oil WTI");
responses.push({ price: "79.46" });
const cm = await market.commodities.price("wti");
ok("commodity price", cm.data.rate === 79.46 && calls.at(-1).includes("symbol=WTI"));

// 13. options
responses.push({ data: [{ contract: "AAPL260918C00200000", strike: "200", option_type: "call" }] });
const oc = await market.options.chain({ symbol: "AAPL" });
ok("options chain", oc.data[0].strike === 200 && oc.data[0].option_type === "call");
responses.push({ data: [{ contract: "AAPL260918C00200000", bid: "5.1", ask: "5.3" }] });
const op = await market.options.prices({ symbol: "AAPL" });
ok("options realtime", op.data[0].bid === 5.1);

// 14. calendars
responses.push({ earnings: [{ symbol: "AAPL", date: "2026-10-30", eps_estimate: "1.6" }] });
const ec = await market.calendar.earningsCalendar({ date: "2026-10-30" });
ok("earningsCalendar", ec.data[0].symbol === "AAPL" && ec.data[0].eps_estimate === 1.6);
responses.push({ ipos: [{ symbol: "NEW", name: "NewCo", exchange: "NASDAQ" }] });
const ic = await market.calendar.ipoCalendar();
ok("ipoCalendar", ic.data[0].name === "NewCo");

// 15. reference lists
responses.push({ data: [{ symbol: "AAPL", name: "Apple Inc" }] });
const rl = await market.reference.stocks();
ok("reference stocks", rl.data[0].symbol === "AAPL");
responses.push({ data: [{ code: "binance", name: "Binance" }] });
const ce = await market.reference.cryptoExchanges();
ok("crypto exchanges", ce.data[0].code === "binance");

// 16. indicators
responses.push({
  meta: {
    symbol: "AAPL",
    interval: "1day",
    indicator: { name: "rsi", series_type: "close", time_period: 14 },
  },
  values: [
    { datetime: "2026-09-08", rsi: "61.3" },
    { datetime: "2026-09-07", rsi: "60.1" },
  ],
  status: "ok",
});
const rsi = await market.indicators.rsi({ symbol: "AAPL", interval: "1day", period: 14 });
ok("rsi", rsi.data[0].value === 61.3);
ok(
  "rsi params",
  calls.at(-1).includes("time_period=14") && calls.at(-1).includes("series_type=close"),
);
responses.push({
  values: [{ datetime: "2026-09-08", macd: "1.5", macd_signal: "1.2", macd_hist: "0.3" }],
});
const md = await market.indicators.macd({ symbol: "AAPL", interval: "1day" });
ok("macd shaped", md.data[0].macd === 1.5 && md.data[0].histogram === 0.3);
responses.push({
  values: [
    {
      datetime: "2026-09-08",
      "Real Upper Band": "2.5",
      "Real Middle Band": "2.0",
      "Real Lower Band": "1.5",
    },
  ],
});
const bb = await market.indicators.bbands({ symbol: "AAPL", interval: "1day" });
ok("bbands shaped", bb.data[0].upper === 2.5 && bb.data[0].lower === 1.5);
responses.push({ values: [{ datetime: "2026-09-08", slow_k: "80.1", slow_d: "75.3" }] });
const so = await market.indicators.stoch({ symbol: "AAPL", interval: "1day" });
ok("stoch shaped", so.data[0].k === 80.1 && so.data[0].d === 75.3);

// 17. raw passthrough
responses.push({ meta: {}, values: [] });
const raw = await market.raw.get("unknown_endpoint", { foo: "bar" });
ok("raw passthrough", raw !== undefined && calls.at(-1).includes("unknown_endpoint?foo=bar"));

// 18. abort
{
  const controller = new AbortController();
  controller.abort();
  responses.push(quoteBody);
  try {
    await market.stocks.quote("AAPL", { signal: controller.signal });
    ok("abort propagates", false);
  } catch (e) {
    ok("abort propagates", e.name === "AbortError");
  }
}

console.log(`\n${passed} checks passed, exit=${process.exitCode ?? 0}`);
