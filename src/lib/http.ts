import ky, { isHTTPError, isNetworkError, isTimeoutError } from "ky";
import type { z } from "zod";
import { PostError } from "@/core/errors";

/**
 * Shared HTTP client — transport policy only (timeout, no implicit retries).
 * Services own their endpoints, response schemas, and domain error mapping;
 * this layer knows nothing about stores, navigation, or UI.
 */
export const http = ky.create({
  timeout: 15_000,
  retry: 0,
});

/**
 * Normalize a transport-level failure into a domain PostError.
 * Endpoint-specific meanings (invalid-password, token-expired) are mapped
 * by each service on top of this baseline.
 */
export function toPostError(e: unknown): PostError {
  if (e instanceof PostError) return e;
  if (isHTTPError(e)) {
    const status = e.response.status;
    if (status === 401 || status === 403) return new PostError("unauthorized");
    return new PostError("internal");
  }
  if (isNetworkError(e) || isTimeoutError(e)) return new PostError("network-failure");
  if (e instanceof SyntaxError) return new PostError("parse-json");
  return new PostError("internal", e);
}

/** Validate a response body against a schema; malformed payloads become PostError("parse-json"). */
export function parseResponse<S extends z.ZodType>(schema: S, json: unknown): z.output<S> {
  const result = schema.safeParse(json);
  if (!result.success) throw new PostError("parse-json", result.error);
  return result.data;
}
