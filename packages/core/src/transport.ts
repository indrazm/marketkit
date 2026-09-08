/**
 * PRD §26/§27/§29: runtime-independent fetch transport with injectable `fetch`,
 * AbortSignal support, per-attempt timeout, and retries with exponential
 * backoff + jitter for 429/500/502/503/504 and network failures.
 */

import {
  AuthenticationError,
  InvalidRequestError,
  MarketKitError,
  NetworkError,
  NotFoundError,
  ParseError,
  ProviderError,
  RateLimitError,
  TimeoutError,
} from "./errors.js";
import type {
  FetchLike,
  FetchRequestInitLike,
  FetchResponseLike,
  Logger,
  ProviderConfig,
  RequestOptions,
  RetryOptions,
} from "./types.js";

const RETRYABLE_STATUS: Record<number, true> = {
  429: true,
  500: true,
  502: true,
  503: true,
  504: true,
};
const MAX_BODY_SNIPPET = 300;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_ATTEMPTS = 2;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8000;

export interface TransportOptions {
  provider: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  retry?: RetryOptions;
  logger?: Logger;
  /**
   * PRD §22: providers communicate API-level conditions (rate limit notes,
   * invalid API keys) inside HTTP 200 payloads. Classify the parsed JSON and
   * return an error to fail the request; return null to accept it.
   */
  classifyPayload?: (payload: unknown) => MarketKitError | null;
}

type AttemptOutcome =
  | { kind: "ok"; response: FetchResponseLike }
  | {
      kind: "fail";
      error: MarketKitError;
      retryable: boolean;
      retryAfterMs?: number;
    };

export class Transport {
  readonly provider: string;
  readonly #fetch: FetchLike;
  readonly #timeoutMs: number;
  readonly #attempts: number;
  readonly #backoff: NonNullable<RetryOptions["backoff"]>;
  readonly #initialDelayMs: number;
  readonly #maxDelayMs: number;
  readonly #jitter: boolean;
  readonly #logger: Logger | undefined;
  readonly #classifyPayload: TransportOptions["classifyPayload"];

  constructor(options: TransportOptions) {
    this.provider = options.provider;
    this.#fetch = options.fetch ?? resolveDefaultFetch(options.provider);
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retry = options.retry ?? {};
    this.#attempts = Math.max(1, retry.attempts ?? DEFAULT_ATTEMPTS);
    this.#backoff = retry.backoff ?? "exponential";
    this.#initialDelayMs = retry.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this.#maxDelayMs = retry.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.#jitter = retry.jitter ?? true;
    this.#logger = options.logger;
    this.#classifyPayload = options.classifyPayload;
  }

  /** JSON request through the retry pipeline, with provider payload classification. */
  async json<T = unknown>(url: string, init?: FetchRequestInitLike & RequestOptions): Promise<T> {
    const response = await this.#request(url, init);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      throw new ParseError(`${this.provider}: response is not valid JSON`, {
        provider: this.provider,
        cause,
      });
    }
    const classified = this.#classifyPayload?.(payload);
    if (classified) throw classified;
    return payload as T;
  }

  /** Raw-text request through the retry pipeline (CSV endpoints, `raw.csv` later). */
  async text(url: string, init?: FetchRequestInitLike & RequestOptions): Promise<string> {
    const response = await this.#request(url, init);
    return response.text();
  }

  async #request(
    url: string,
    init?: FetchRequestInitLike & RequestOptions,
  ): Promise<FetchResponseLike> {
    for (let attempt = 1; ; attempt++) {
      const outcome = await this.#attempt(url, init);
      if (outcome.kind === "ok") return outcome.response;
      if (!outcome.retryable || attempt >= this.#attempts) throw outcome.error;
      const delayMs = outcome.retryAfterMs ?? this.#backoffDelayMs(attempt);
      this.#logger?.debug(
        `${this.provider}: attempt ${attempt} failed (${outcome.error.code}); retrying in ${delayMs}ms`,
      );
      await sleep(delayMs, init?.signal);
    }
  }

  /** Delay before retrying after `failedAttempt` failures. */
  #backoffDelayMs(failedAttempt: number): number {
    if (this.#backoff === "fixed") return this.#initialDelayMs;
    const exponential = Math.min(this.#initialDelayMs * 2 ** (failedAttempt - 1), this.#maxDelayMs);
    // Half-jitter: delay lands in [base/2, base) so concurrent callers spread out
    // without ever retrying near-instantly.
    return this.#jitter
      ? Math.floor(exponential / 2 + Math.random() * (exponential / 2))
      : exponential;
  }

  async #attempt(
    url: string,
    init?: FetchRequestInitLike & RequestOptions,
  ): Promise<AttemptOutcome> {
    const signal = init?.signal;
    const controller = new AbortController();
    let timedOut = false;
    const abortFromUser = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", abortFromUser, { once: true });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);
    try {
      const response = await this.#fetch(url, {
        ...init,
        signal: controller.signal,
      });
      if (response.ok) return { kind: "ok", response };
      return await this.#httpFailure(response);
    } catch (cause) {
      if (signal?.aborted && !timedOut) {
        // The caller cancelled: surface their signal's own rejection untouched
        // so `signal.aborted` reasoning stays intact at the call site.
        throw cause;
      }
      if (timedOut || isAbortError(cause)) {
        return {
          kind: "fail",
          retryable: true,
          error: new TimeoutError(
            `${this.provider}: request timed out after ${this.#timeoutMs}ms`,
            { provider: this.provider, cause },
          ),
        };
      }
      if (cause instanceof MarketKitError) {
        return { kind: "fail", error: cause, retryable: false };
      }
      return {
        kind: "fail",
        retryable: true,
        error: new NetworkError(`${this.provider}: request failed: ${message(cause)}`, {
          provider: this.provider,
          cause,
        }),
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortFromUser);
    }
  }

  async #httpFailure(response: FetchResponseLike): Promise<AttemptOutcome> {
    const snippet = await bodySnippet(response);
    const { status, statusText } = response;
    const detail = `${this.provider}: HTTP ${status}${statusText ? ` ${statusText}` : ""}${snippet ? `: ${snippet}` : ""}`;
    const cause = snippet || undefined;
    const provider = this.provider;
    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));

    if (status === 429) {
      return {
        kind: "fail",
        retryable: true,
        retryAfterMs,
        error: new RateLimitError(detail, {
          provider,
          cause,
          retryAfter: retryAfterMs !== undefined ? Math.ceil(retryAfterMs / 1000) : undefined,
        }),
      };
    }
    if (status === 401 || status === 403) {
      return fail(new AuthenticationError(detail, { provider, cause }));
    }
    if (status === 404) {
      return fail(new NotFoundError(detail, { provider, cause }));
    }
    if (status >= 500) {
      return {
        kind: "fail",
        retryable: RETRYABLE_STATUS[status] === true,
        error: new ProviderError(detail, { provider, cause }),
      };
    }
    return fail(new InvalidRequestError(detail, { provider, cause }));
  }
}

/** Shared transport factory so every provider client configures identically (PRD §6). */
export function createTransport(provider: string, config: ProviderConfig): Transport {
  return new Transport({
    provider,
    fetch: config.fetch,
    timeoutMs: config.timeout,
    retry: config.retry,
    logger: config.logger,
  });
}

function fail(error: MarketKitError): AttemptOutcome {
  return { kind: "fail", error, retryable: false };
}

function resolveDefaultFetch(provider: string): FetchLike {
  const fetchFn = (globalThis as { fetch?: unknown }).fetch;
  if (typeof fetchFn !== "function") {
    throw new NetworkError(
      `${provider}: no global fetch in this runtime; inject one via the \`fetch\` option`,
      { provider },
    );
  }
  return fetchFn as FetchLike;
}

async function bodySnippet(response: FetchResponseLike): Promise<string> {
  try {
    const text = (await response.text()).trim();
    return text.length > MAX_BODY_SNIPPET ? `${text.slice(0, MAX_BODY_SNIPPET - 3)}...` : text;
  } catch {
    return "";
  }
}

/** `Retry-After` as seconds or HTTP-date, converted to milliseconds. */
function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

function isAbortError(cause: unknown): boolean {
  return (cause as { name?: string } | null)?.name === "AbortError";
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const onAbort = () => {
    clearTimeout(timer);
    reject(abortError());
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve();
  }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
  return promise;
}
