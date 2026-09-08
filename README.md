# MarketKit

A type-safe, ergonomic TypeScript SDK for financial market data, designed provider-first: normalize the developer experience, not the financial data. First target is Alpha Vantage, with the architecture open to Twelve Data, Finnhub, Massive, and others.

> **Status: work in progress.** Unofficial SDK — not affiliated with, endorsed by, or connected to Alpha Vantage or any other data provider. This implementation is for personal use; use it at your own risk.

## Packages

| Package                                                             | Status                                                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@marketkit/core`                                                   | Transport (fetch injection, timeouts, abort, retries), error hierarchy, response envelope, parsing helpers |
| `@marketkit/alphavantage`                                           | Planned — Alpha Vantage client                                                                             |
| `@marketkit/twelvedata`, `@marketkit/finnhub`, `@marketkit/massive` | Planned                                                                                                    |
| `@marketkit/mcp`                                                    | Planned — MCP server                                                                                       |

Nothing is published to npm yet. The repository is a pnpm workspace; clone and build locally:

```bash
pnpm install
pnpm -r build
pnpm lint
```

## Requirements

- Node.js >= 22 (also targets Bun, Deno, and Cloudflare Workers — the core transport only relies on standard `fetch`, `AbortSignal`, and `setTimeout`)
- pnpm

## Design

- ESM-first, tree-shakeable, no runtime dependencies in core.
- Domain-oriented API (planned): `market.stocks.quote(...)`, `market.stocks.history(...)`, `market.raw.request(...)` — provider function names stay out of the public surface.
- Predictable errors: everything derives from `MarketKitError` (`AuthenticationError`, `RateLimitError`, `InvalidRequestError`, `NotFoundError`, `TimeoutError`, `NetworkError`, `ProviderError`, `ParseError`).
- Responses come as a `MarketResponse { data, meta }` envelope with `provider` and `fetchedAt` metadata.
- Numeric strings from providers are parsed into real `number`s; dates come back as `Date`.

See [PRD.md](PRD.md) for the full product requirements and API design.
