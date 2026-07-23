// ky adapter for the HTTP capability. The only module in src/core that
// imports the transport library — everything else programs against
// PlatformHttp (`@/core/platform/fetch`). Error translation is PRIVATE to
// this adapter: nothing ky-shaped ever crosses the seam. No index.node.ts:
// ky runs in Node, so tests use this adapter as-is.
import ky, { isHTTPError, isNetworkError, isTimeoutError, type Options as KyOptions } from "ky";
import type { z } from "zod";
import { ActualError } from "@/core/errors";
import type { HttpRequestOptions, HttpResponse, PlatformHttp } from "./types";

export type { HttpRequestOptions, HttpResponse, PlatformHttp } from "./types";

const DEFAULT_TIMEOUT = 15_000;

function adapt(opts?: HttpRequestOptions): KyOptions {
  return {
    headers: opts?.headers,
    json: opts?.json,
    body: opts?.body,
    timeout: opts?.timeout ?? DEFAULT_TIMEOUT,
    throwHttpErrors: opts?.throwHttpErrors,
    retry: opts?.retry
      ? {
          limit: opts.retry.limit,
          delay: (attempt) => opts.retry!.delayMs(attempt),
          shouldRetry: () => true,
        }
      : 0,
  };
}

/** Translate a ky/fetch failure into the typed error the contract promises. */
async function translate(e: unknown): Promise<ActualError> {
  if (e instanceof ActualError) return e;
  if (isHTTPError(e)) {
    const status = e.response.status;
    if (status === 401 || status === 403) return new ActualError("auth/unauthorized");
    // Surface the server's JSON `reason` (e.g. "invalid-password") so domain
    // code can react to it without touching the transport library. ky already
    // consumed the body into HTTPError#data; fall back to cloning when not.
    let serverReason: string | undefined;
    const data = (e as { data?: unknown }).data;
    if (data && typeof data === "object") {
      serverReason = (data as { reason?: string }).reason;
    } else {
      try {
        serverReason = ((await e.response.clone().json()) as { reason?: string } | null)?.reason;
      } catch {
        // Body unavailable or non-JSON — nothing to extract.
      }
    }
    return new ActualError("http/server-error", { context: { status, serverReason } });
  }
  if (isTimeoutError(e)) return new ActualError("network/timeout");
  if (isNetworkError(e)) return new ActualError("network/offline");
  if (e instanceof SyntaxError) return new ActualError("http/parse-error");
  return new ActualError("http/server-error", { cause: e });
}

function wrap(res: Response): HttpResponse {
  return {
    ok: res.ok,
    status: res.status,
    headers: res.headers,
    text: () => res.text(),
    json: async <T>() => {
      try {
        return (await res.json()) as T;
      } catch (e) {
        throw new ActualError("http/parse-error", { cause: e });
      }
    },
    arrayBuffer: () => res.arrayBuffer(),
  };
}

async function request(
  method: "get" | "post",
  url: string,
  opts?: HttpRequestOptions,
): Promise<HttpResponse> {
  try {
    return wrap(await ky[method](url, adapt(opts)));
  } catch (e) {
    throw await translate(e);
  }
}

export const http: PlatformHttp = {
  get: (url, opts) => request("get", url, opts),
  post: (url, opts) => request("post", url, opts),
};

/** Validate a JSON payload against a zod schema (transport-agnostic helper). */
export function parseResponse<S extends z.ZodType>(schema: S, json: unknown): z.output<S> {
  const result = schema.safeParse(json);
  if (!result.success) throw new ActualError("http/parse-error", { cause: result.error });
  return result.data;
}
