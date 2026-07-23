// Platform capability contract: HTTP transport. The single network seam for
// src/core — mirrors upstream's `#platform/server/fetch` role with our own
// vocabulary, so swapping the underlying client (ky today; axios/fetch
// tomorrow) only rewrites the adapter in index.ts.
//
// Errors are part of the contract: requests reject ONLY with typed
// ActualError (network/timeout · network/offline · http/server-error ·
// auth/unauthorized for 401/403 · http/parse-error). Raw library errors
// never cross this seam — each adapter translates its own.
export interface HttpRequestOptions {
  headers?: Record<string, string>;
  /** JSON body — serialized (and content-typed) by the adapter. */
  json?: unknown;
  /** Raw binary body (snapshot uploads). Mutually exclusive with `json`. */
  body?: ArrayBuffer;
  /** Milliseconds; `false` disables the timeout. Default: 15_000. */
  timeout?: number | false;
  /** When false, non-2xx responses resolve instead of rejecting. Default: true. */
  throwHttpErrors?: boolean;
  /** Retry policy. Default: no retries. Retries apply to any failure. */
  retry?: { limit: number; delayMs: (attempt: number) => number };
}

export interface HttpResponseHeaders {
  get(name: string): string | null;
  has(name: string): boolean;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  headers: HttpResponseHeaders;
  text(): Promise<string>;
  /** Rejects with ActualError("http/parse-error") on invalid JSON. */
  json<T = unknown>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface PlatformHttp {
  get(url: string, opts?: HttpRequestOptions): Promise<HttpResponse>;
  post(url: string, opts?: HttpRequestOptions): Promise<HttpResponse>;
}
