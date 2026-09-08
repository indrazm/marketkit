# MarketKit — Product Requirements Document

## 1. Product

**Name:** MarketKit
**Initial package:** `@marketkit/alphavantage`

**Positioning:**

> A type-safe, ergonomic JavaScript/TypeScript SDK for financial market data.

The first provider is Alpha Vantage, but the API should be designed so MarketKit can eventually support Twelve Data, Finnhub, Massive, etc.

The key principle:

> **Normalize the developer experience, not necessarily the financial data.**

This distinction matters.

I would **not** immediately force every Alpha Vantage response into some universal `Quote`/`Company` abstraction. That often throws away provider-specific capabilities.

Instead:

```text
Alpha Vantage API
       ↓
transport
       ↓
validation/parsing
       ↓
clean Alpha Vantage SDK
       ↓
optional normalized MarketKit API later
       ↓
optional MCP
```

---

# 2. Problem

Using Alpha Vantage directly means developers deal with things like:

```ts
fetch(
  "https://www.alphavantage.co/query" +
  "?function=TIME_SERIES_DAILY_ADJUSTED" +
  "&symbol=AAPL" +
  "&outputsize=compact" +
  "&apikey=..."
);
```

and responses such as:

```json
{
  "Meta Data": {},
  "Time Series (Daily)": {
    "2026-09-08": {
      "1. open": "237.00",
      "2. high": "240.00",
      "3. low": "235.00",
      "4. close": "239.00",
      "5. adjusted close": "239.00"
    }
  }
}
```

The official documentation itself remains centered around the `function=...` query model. ([Alpha Vantage][2])

Meanwhile, Alpha Vantage MCP exposes those functions directly:

```text
TIME_SERIES_INTRADAY
TIME_SERIES_DAILY
TIME_SERIES_DAILY_ADJUSTED
TIME_SERIES_WEEKLY
TIME_SERIES_WEEKLY_ADJUSTED
...
SMA
EMA
MACD
RSI
ADX
ATR
...
```

([GitHub][1])

MarketKit should turn that into an API developers can discover naturally through their IDE.

---

# 3. Goals

MarketKit v1 should provide:

**Excellent TypeScript DX**

```ts
market.stocks.quote(...)
market.stocks.history(...)
market.stocks.search(...)
```

rather than requiring knowledge of Alpha Vantage function names.

**Zero Alpha Vantage response weirdness**

Convert:

```json
{
  "05. price": "239.1200"
}
```

into:

```ts
{
  price: 239.12
}
```

**Predictable errors**

```ts
MarketKitError
AuthenticationError
RateLimitError
InvalidRequestError
ProviderError
```

**Runtime independent where practical**

Target:

```text
Node.js
Bun
Deno
Cloudflare Workers
Vercel/Next.js server
```

Avoid Node-only dependencies in the core transport.

**Tree-shakeable ESM-first package.**

**Raw escape hatch** for users who need Alpha Vantage-specific functionality.

---

# 4. Non-goals for v1

Do NOT initially build:

```text
@marketkit/core
@marketkit/twelvedata
@marketkit/finnhub
@marketkit/mcp
```

Do not implement portfolio management.

Do not implement trading/order execution.

Do not calculate dozens of technical indicators locally.

Do not build caching infrastructure.

Do not build a universal financial-data model prematurely.

And importantly:

**Do not implement every Alpha Vantage endpoint before shipping.**

---

# 5. Installation

```bash
npm install @marketkit/alphavantage
```

or:

```bash
pnpm add @marketkit/alphavantage
```

---

# 6. Client creation

My preferred API:

```ts
import { AlphaVantage } from "@marketkit/alphavantage";

const market = new AlphaVantage({
  apiKey: process.env.ALPHA_VANTAGE_API_KEY!,
});
```

I prefer this over:

```ts
createAlphaVantage(...)
```

because providers naturally become client implementations later.

Configuration:

```ts
const market = new AlphaVantage({
  apiKey,

  timeout: 10_000,

  retry: {
    attempts: 2,
    backoff: "exponential",
  },
});
```

Keep configuration small.

Don't start with 30 knobs.

---

# 7. API namespaces

This is the important part.

I'd organize around **financial domains**, not Alpha Vantage endpoint categories.

```ts
market.stocks
market.fundamentals
market.news
market.options
market.forex
market.crypto
market.commodities
market.economy
market.indicators
market.raw
```

IDE autocomplete therefore becomes documentation.

---

# 8. Stocks API

## Quote

```ts
const quote = await market.stocks.quote("AAPL");
```

Return:

```ts
interface StockQuote {
  symbol: string;

  price: number;
  open: number;
  high: number;
  low: number;

  previousClose: number;

  change: number;
  changePercent: number;

  volume: number;

  latestTradingDay: string;
}
```

Notice:

```ts
changePercent: number
```

not:

```ts
changePercent: "1.2384%"
```

Parsing belongs in the SDK.

---

# 9. Historical prices

This is where I would deliberately **hide Alpha Vantage's endpoint proliferation**.

Instead of:

```ts
daily()
dailyAdjusted()
weekly()
weeklyAdjusted()
monthly()
monthlyAdjusted()
```

provide:

```ts
market.stocks.history("AAPL", {
  interval: "1d"
});
```

Adjusted:

```ts
market.stocks.history("AAPL", {
  interval: "1d",
  adjusted: true
});
```

Intraday:

```ts
market.stocks.history("AAPL", {
  interval: "5m"
});
```

Weekly:

```ts
market.stocks.history("AAPL", {
  interval: "1w"
});
```

Monthly:

```ts
market.stocks.history("AAPL", {
  interval: "1mo"
});
```

Type:

```ts
type StockInterval =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "60m"
  | "1d"
  | "1w"
  | "1mo";
```

The adapter decides which Alpha Vantage function is necessary.

That eliminates several MCP-style concepts from the public API.

---

# 10. Historical response

I'd return:

```ts
interface Candle {
  timestamp: Date;

  open: number;
  high: number;
  low: number;
  close: number;

  volume: number;

  adjustedClose?: number;
  dividend?: number;
  splitCoefficient?: number;
}
```

Usage:

```ts
const candles = await market.stocks.history("AAPL", {
  interval: "1d",
  adjusted: true,
});

candles[0].close;
```

However, there's one design decision I'd make differently from many SDKs.

Return an envelope:

```ts
const result = await market.stocks.history(...);

result.data
result.meta
```

rather than only the array.

For example:

```ts
interface MarketResponse<T, M = ResponseMeta> {
  data: T;
  meta: M;
}
```

Then:

```ts
result.data[0].close;
```

and metadata remains available:

```ts
result.meta.symbol;
result.meta.lastRefreshed;
result.meta.timezone;
```

This becomes useful later for caching, provenance and multi-provider support.

---

# 11. Symbol search

```ts
const result = await market.stocks.search("apple");
```

Return:

```ts
interface Instrument {
  symbol: string;
  name: string;

  type?: string;
  region?: string;
  currency?: string;

  marketOpen?: string;
  marketClose?: string;
  timezone?: string;

  matchScore?: number;
}
```

---

# 12. Batch quotes

Alpha Vantage currently exposes realtime bulk quotes for up to 100 symbols in its MCP/API surface. ([GitHub][1])

MarketKit:

```ts
await market.stocks.quotes([
  "AAPL",
  "MSFT",
  "NVDA",
]);
```

Not:

```ts
REALTIME_BULK_QUOTES(...)
```

---

# 13. Market status

```ts
await market.stocks.marketStatus();
```

or perhaps more generally:

```ts
await market.market.status();
```

I slightly prefer the latter if you're willing to introduce:

```ts
market.market
```

as another namespace.

---

# 14. Fundamentals

This should be particularly pleasant.

```ts
await market.fundamentals.company("AAPL");
```

rather than:

```text
COMPANY_OVERVIEW
```

Financial statements:

```ts
await market.fundamentals.incomeStatement("AAPL");
await market.fundamentals.balanceSheet("AAPL");
await market.fundamentals.cashFlow("AAPL");
```

Earnings:

```ts
await market.fundamentals.earnings("AAPL");
```

Calendars:

```ts
await market.fundamentals.earningsCalendar({
  horizon: "3month",
});

await market.fundamentals.ipoCalendar();
```

These correspond cleanly to Alpha Vantage's current fundamental-data capabilities. ([GitHub][1])

---

# 15. News

This is where I'd improve substantially over the vendor API.

```ts
await market.news.search({
  symbols: ["AAPL", "NVDA"],
});
```

Other filters:

```ts
await market.news.search({
  topics: ["technology"],
  from: new Date("2026-09-01"),
  limit: 50,
});
```

Response:

```ts
interface NewsArticle {
  title: string;
  url: string;

  source: string;
  publishedAt: Date;

  summary?: string;

  sentiment?: {
    score: number;
    label: string;
  };

  tickers?: Array<{
    symbol: string;
    relevance: number;
    sentiment: number;
  }>;
}
```

---

# 16. Technical indicators

Here's somewhere I **would not mirror Alpha Vantage**.

Their MCP exposes dozens of tools such as SMA, EMA, MACD, RSI, ADX, ATR, BBANDS and many others. ([GitHub][1])

Don't make:

```ts
market.indicators.sma()
market.indicators.ema()
market.indicators.wma()
market.indicators.dema()
market.indicators.tema()
...
```

your *only* abstraction.

I'd provide:

```ts
market.indicators.get("rsi", {
  symbol: "AAPL",
  interval: "1d",
  period: 14,
});
```

with typed overloads.

For popular indicators, ergonomic helpers can exist:

```ts
market.indicators.rsi("AAPL", {
  interval: "1d",
  period: 14,
});

market.indicators.macd("AAPL", {
  interval: "1d",
});

market.indicators.sma("AAPL", {
  interval: "1d",
  period: 20,
});
```

But internally they all use:

```ts
indicators.get()
```

That gives you one extensible mechanism.

---

# 17. Forex

Don't expose:

```text
FX_INTRADAY
FX_DAILY
FX_WEEKLY
FX_MONTHLY
```

Expose:

```ts
market.forex.history("EUR/USD", {
  interval: "1d",
});
```

Quote:

```ts
market.forex.quote("EUR/USD");
```

Or typed pair objects:

```ts
market.forex.quote({
  from: "EUR",
  to: "USD",
});
```

I prefer the second internally because parsing strings adds unnecessary ambiguity.

---

# 18. Crypto

Same philosophy:

```ts
market.crypto.quote({
  symbol: "BTC",
  currency: "USD",
});
```

History:

```ts
market.crypto.history({
  symbol: "BTC",
  currency: "USD",
  interval: "1d",
});
```

---

# 19. Options

Later in v1:

```ts
market.options.chain("AAPL");
```

Historical:

```ts
market.options.chain("AAPL", {
  date: "2026-08-20",
});
```

Potentially:

```ts
market.options.contract(...)
```

but only if the underlying API supports the semantics cleanly.

---

# 20. Raw API

This is **essential**.

You will never wrap Alpha Vantage quickly enough to satisfy every advanced user.

Give them:

```ts
await market.raw.request({
  function: "TIME_SERIES_DAILY",
  symbol: "AAPL",
});
```

or even:

```ts
await market.raw("TIME_SERIES_DAILY", {
  symbol: "AAPL",
});
```

I prefer:

```ts
market.raw.request(...)
```

because it leaves room for:

```ts
market.raw.csv(...)
```

later.

This means MarketKit can ship when only 20–30 endpoints have beautiful wrappers.

Everything else remains accessible.

---

# 21. Responses

I'd standardize successful calls:

```ts
interface MarketResponse<T, M = ResponseMeta> {
  data: T;
  meta: M;
}
```

Example:

```ts
const { data, meta } =
  await market.stocks.quote("AAPL");
```

Generic metadata:

```ts
interface ResponseMeta {
  provider: "alphavantage";

  fetchedAt: Date;

  requestId?: string;
}
```

Endpoint-specific metadata extends it.

Do **not** expose HTTP implementation details by default.

---

# 22. Error architecture

Very important for SDK quality.

Everything should derive from:

```ts
class MarketKitError extends Error {
  code: string;
  provider: string;
  cause?: unknown;
}
```

Then:

```ts
AuthenticationError
RateLimitError
InvalidRequestError
NotFoundError
TimeoutError
NetworkError
ProviderError
ParseError
```

Example:

```ts
try {
  await market.stocks.quote("INVALID");
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(error.retryAfter);
  }
}
```

`RateLimitError`:

```ts
class RateLimitError extends MarketKitError {
  retryAfter?: number;
  limit?: number;
}
```

Critically, Alpha Vantage can communicate API-level conditions through response payloads, so your transport needs to inspect successful HTTP responses rather than assuming HTTP 200 means a successful market-data operation.

---

# 23. Runtime validation

I'd use something lightweight.

Possibilities:

```text
Zod
Valibot
ArkType
custom parsers
```

For a low-level SDK, I lean toward **Valibot or custom parsing** rather than dragging a large validation dependency into every installation.

Something like:

```ts
function parseNumber(value: unknown): number {
  const result = Number(value);

  if (!Number.isFinite(result)) {
    throw new ParseError(...);
  }

  return result;
}
```

Alpha Vantage requires quite a lot of response normalization anyway.

---

# 24. Dates

Use:

```ts
Date
```

in returned runtime objects.

Accept both:

```ts
Date | string
```

for inputs where appropriate.

For date-only concepts:

```ts
type DateString = `${number}-${number}-${number}`;
```

Don't introduce Temporal as a hard requirement yet.

---

# 25. Numeric values

Return actual:

```ts
number
```

for prices and percentages.

Not numeric strings.

But be cautious with extremely large financial values where JS precision becomes relevant.

For v1, normal stock-market values as `number` are pragmatic.

---

# 26. AbortSignal

Absolutely support this:

```ts
await market.stocks.quote("AAPL", {
  signal: controller.signal,
});
```

Ideally every request accepts:

```ts
interface RequestOptions {
  signal?: AbortSignal;
}
```

This makes the SDK work properly in modern JS servers.

---

# 27. Transport injection

This is another feature worth having from day one:

```ts
new AlphaVantage({
  apiKey,
  fetch: customFetch,
});
```

Default:

```ts
globalThis.fetch
```

This makes testing dramatically easier and supports unusual runtimes.

---

# 28. Logging

Don't automatically log.

Allow:

```ts
new AlphaVantage({
  apiKey,
  logger,
});
```

with:

```ts
interface Logger {
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
```

But this can wait until v1.1.

---

# 29. Retries

Retry:

```text
429
500
502
503
504
network failures
```

Don't retry:

```text
401
403
invalid parameters
invalid symbols
```

Default:

```ts
retry: {
  attempts: 2,
}
```

Use exponential backoff + jitter.

---

# 30. Package exports

I'd make it ESM-first:

```json
{
  "name": "@marketkit/alphavantage",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

Whether to support CommonJS is worth deciding based on target users.

In 2026, for a new SDK, I'd strongly consider **ESM-only** unless compatibility data tells you otherwise.

---

# 31. TypeScript example

The overall experience should feel approximately like this:

```ts
import { AlphaVantage } from "@marketkit/alphavantage";

const market = new AlphaVantage({
  apiKey: process.env.ALPHA_VANTAGE_API_KEY!,
});

// Quote

const { data: quote } =
  await market.stocks.quote("AAPL");

console.log(
```

[1]: https://github.com/alphavantage/alpha_vantage_mcp?utm_source=chatgpt.com "GitHub - alphavantage/alpha_vantage_mcp: Alpha Vantage MCP Server · GitHub"
[2]: https://www.alphavantage.co/documentation/?utm_source=chatgpt.com "API Documentation | Alpha Vantage"

