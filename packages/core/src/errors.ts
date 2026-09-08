/**
 * PRD §22: error architecture. Everything derives from `MarketKitError`;
 * HTTP status → error mapping lives in the transport, provider payload-level
 * conditions are classified by the provider via `TransportOptions.classifyPayload`.
 */

export interface MarketKitErrorOptions {
  provider?: string;
  code?: string;
  cause?: unknown;
}

export class MarketKitError extends Error {
  readonly code: string;
  readonly provider: string;

  constructor(message: string, options: MarketKitErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code ?? "market_kit_error";
    this.provider = options.provider ?? "unknown";
  }
}

export interface FieldedErrorOptions extends MarketKitErrorOptions {
  field?: string;
}

export class AuthenticationError extends MarketKitError {
  constructor(message: string, options: MarketKitErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? "authentication" });
  }
}

export class RateLimitError extends MarketKitError {
  /** Seconds to wait before retrying, when the provider advertises it. */
  readonly retryAfter?: number;
  readonly limit?: number;

  constructor(
    message: string,
    options: MarketKitErrorOptions & { retryAfter?: number; limit?: number } = {},
  ) {
    super(message, { ...options, code: options.code ?? "rate_limit" });
    this.retryAfter = options.retryAfter;
    this.limit = options.limit;
  }
}

export class InvalidRequestError extends MarketKitError {
  constructor(message: string, options: MarketKitErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? "invalid_request" });
  }
}

export class NotFoundError extends MarketKitError {
  constructor(message: string, options: MarketKitErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? "not_found" });
  }
}

export class TimeoutError extends MarketKitError {
  constructor(message: string, options: MarketKitErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? "timeout" });
  }
}

export class NetworkError extends MarketKitError {
  constructor(message: string, options: MarketKitErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? "network" });
  }
}

export class ProviderError extends MarketKitError {
  constructor(message: string, options: MarketKitErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? "provider_error" });
  }
}

export class ParseError extends MarketKitError {
  readonly field?: string;

  constructor(message: string, options: FieldedErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? "parse_error" });
    this.field = options.field;
  }
}
