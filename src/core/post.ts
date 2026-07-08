import { TimeoutError } from "ky";
import { http } from "@/services/api/httpClient";
import { ActualError } from "@/core/errors";

type ServerReasonBody = { status?: string; reason?: string; description?: string };

const AUTH_REASONS = new Set(["unauthorized", "token-expired"]);

/** Map a server-provided `reason`/`description` string to a domain error. */
function toDomainError(reason: string | undefined, fallbackText: string): ActualError {
  if (reason && AUTH_REASONS.has(reason)) {
    return new ActualError("auth/token-expired", { context: { serverReason: reason } });
  }
  return new ActualError("http/rejected", {
    context: { serverReason: reason ?? fallbackText.slice(0, 500) },
  });
}

/**
 * Turn a non-2xx response into the right ActualError (status, JSON reason,
 * ngrok tunnel errors). `bodyText` must be passed when the body was already
 * consumed by the caller (e.g. postBinary reading it via arrayBuffer) —
 * a Response body can only be read once.
 */
async function toResponseError(res: Response, bodyText?: string): Promise<ActualError> {
  if (res.status === 500) return new ActualError("http/server-error");

  const text = bodyText ?? (await res.text());
  const contentType = res.headers.get("Content-Type") ?? "";
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      const json: ServerReasonBody = JSON.parse(text);
      return toDomainError(json.reason, text);
    } catch {
      // fall through to raw-text handling below
    }
  }

  if (res.headers.has("ngrok-error-code")) {
    return new ActualError("network/offline");
  }

  return toDomainError(undefined, text);
}

// Both callers below pass `throwHttpErrors: false`, so ky never throws
// HTTPError here — non-2xx responses are handled via `!res.ok` + toResponseError.
// This only sees genuine transport failures (offline, DNS, timeout).
function toTransportError(e: unknown): ActualError {
  if (e instanceof TimeoutError) return new ActualError("network/timeout");
  return new ActualError("network/offline");
}

export async function post(
  url: string,
  data: unknown,
  headers: Record<string, string> = {},
  timeout: number | false = false,
): Promise<unknown> {
  let text: string;
  try {
    const res = await http.post(url, {
      json: data,
      headers,
      timeout,
      retry: 0,
      throwHttpErrors: false,
    });
    if (!res.ok) throw await toResponseError(res);
    text = await res.text();
  } catch (e) {
    if (e instanceof ActualError) throw e;
    throw toTransportError(e);
  }

  let responseData: ServerReasonBody & { data?: unknown };
  try {
    responseData = JSON.parse(text);
  } catch {
    throw new ActualError("http/parse-error", { context: { body: text.slice(0, 500) } });
  }

  if (responseData.status !== "ok") {
    if (__DEV__) {
      console.warn("API call failed: " + url + "\nResponse: " + JSON.stringify(responseData));
    }
    throw toDomainError(responseData.description ?? responseData.reason, text);
  }

  return responseData.data;
}

const DEFAULT_BINARY_TIMEOUT = 10_000;

export async function postBinary(
  url: string,
  data: Uint8Array,
  headers: Record<string, string> = {},
  timeout: number = DEFAULT_BINARY_TIMEOUT,
): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await http.post(url, {
      body: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      timeout,
      retry: 0,
      throwHttpErrors: false,
      headers: {
        "Content-Length": String(data.byteLength),
        "Content-Type": "application/actual-sync",
        ...headers,
      },
    });
  } catch (e) {
    throw toTransportError(e);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  if (!res.ok) {
    throw await toResponseError(res, new TextDecoder().decode(buffer));
  }

  return buffer;
}
