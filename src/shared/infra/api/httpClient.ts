import ky, { isHTTPError, isNetworkError, isTimeoutError } from "ky";
import type { z } from "zod";
import { ActualError } from "@/core/errors";

export const http = ky.create({
  timeout: 15_000,
  retry: 0,
});

export function toTransportError(e: unknown): ActualError {
  if (e instanceof ActualError) return e;
  if (isHTTPError(e)) {
    const status = e.response.status;
    if (status === 401 || status === 403) return new ActualError("auth/unauthorized");
    return new ActualError("http/server-error", { context: { status } });
  }
  if (isTimeoutError(e)) return new ActualError("network/timeout");
  if (isNetworkError(e)) return new ActualError("network/offline");
  if (e instanceof SyntaxError) return new ActualError("http/parse-error");
  return new ActualError("http/server-error", { cause: e });
}

export function parseResponse<S extends z.ZodType>(schema: S, json: unknown): z.output<S> {
  const result = schema.safeParse(json);
  if (!result.success) throw new ActualError("http/parse-error", { cause: result.error });
  return result.data;
}
