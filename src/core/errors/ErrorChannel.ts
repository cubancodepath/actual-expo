import { normalizeError } from "./normalizeError";
import type { ErrorCode as LegacyErrorCode } from "./codes";

export type ErrorCode =
  | "NETWORK_OFFLINE"
  | "NETWORK_TIMEOUT"
  | "HTTP_SERVER_ERROR"
  | "HTTP_PARSE_ERROR"
  | "HTTP_REJECTED"
  | "AUTH_UNAUTHORIZED"
  | "AUTH_TOKEN_EXPIRED"
  | "AUTH_INVALID_PASSWORD"
  | "SYNC_CLOCK_DRIFT"
  | "SYNC_OUT_OF_SYNC"
  | "SYNC_INVALID_SCHEMA"
  | "SYNC_ENCRYPT_FAILED"
  | "SYNC_DECRYPT_FAILED"
  | "SYNC_KEY_MISSING"
  | "FILE_UPLOAD_FAILED"
  | "FILE_DOWNLOAD_FAILED"
  | "FILE_CORRUPT"
  | "FILE_DELETE_FAILED"
  | "FILE_SWITCH_FAILED"
  | "STORAGE_READ_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "STORAGE_DELETE_FAILED"
  | "STORAGE_CORRUPT_DATA"
  | "DB_UNAVAILABLE"
  | "UNKNOWN_UNEXPECTED";

export type ErrorSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type ErrorSource =
  | "AUTH"
  | "NETWORK"
  | "HTTP"
  | "SYNC"
  | "STORAGE"
  | "DATABASE"
  | "FILES"
  | "UNKNOWN";

export type ErrorEvent = {
  id: string;
  code: ErrorCode;
  source: ErrorSource;
  severity: ErrorSeverity;
  message: string;
  cause?: unknown;
  context?: Record<string, unknown>;
  retry?: () => Promise<void> | void;
  createdAt: number;
};

export type ErrorEventInput = Omit<ErrorEvent, "id" | "createdAt">;

export type EmitErrorOptions = {
  code?: ErrorCode;
  source?: ErrorSource;
  severity?: ErrorSeverity;
  message?: string;
  context?: Record<string, unknown>;
  retry?: () => Promise<void> | void;
};

type ErrorListener = (event: ErrorEvent) => void;

let nextErrorEventId = 0;
const emittedErrorEvents = new WeakMap<object, ErrorEvent>();

class ErrorChannel {
  private listeners = new Set<ErrorListener>();

  subscribe(listener: ErrorListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: ErrorEventInput): ErrorEvent {
    const fullEvent: ErrorEvent = {
      ...event,
      id: String(nextErrorEventId++),
      createdAt: Date.now(),
    };

    for (const listener of this.listeners) {
      listener(fullEvent);
    }

    return fullEvent;
  }
}

export const errorChannel = new ErrorChannel();

export function emitErrorEvent(error: unknown, options: EmitErrorOptions = {}): ErrorEvent {
  const emittedKey = getObjectKey(error);
  const existingEvent = emittedKey ? emittedErrorEvents.get(emittedKey) : undefined;
  if (existingEvent) return existingEvent;

  const normalized = normalizeError(error);
  const code = options.code ?? toErrorChannelCode(normalized.code);

  const event = errorChannel.emit({
    code,
    source: options.source ?? toErrorSource(code),
    severity: options.severity ?? toErrorSeverity(code),
    message: options.message ?? normalized.message,
    cause: normalized.cause ?? error,
    context: { ...normalized.context, ...options.context },
    retry: options.retry,
  });

  if (emittedKey) emittedErrorEvents.set(emittedKey, event);
  return event;
}

function getObjectKey(value: unknown): object | null {
  if ((typeof value === "object" && value !== null) || typeof value === "function") return value;
  return null;
}

export function toErrorChannelCode(code: LegacyErrorCode): ErrorCode {
  switch (code) {
    case "network/offline":
      return "NETWORK_OFFLINE";
    case "network/timeout":
      return "NETWORK_TIMEOUT";
    case "http/server-error":
      return "HTTP_SERVER_ERROR";
    case "http/parse-error":
      return "HTTP_PARSE_ERROR";
    case "http/rejected":
      return "HTTP_REJECTED";
    case "auth/unauthorized":
      return "AUTH_UNAUTHORIZED";
    case "auth/token-expired":
      return "AUTH_TOKEN_EXPIRED";
    case "auth/invalid-password":
      return "AUTH_INVALID_PASSWORD";
    case "sync/clock-drift":
      return "SYNC_CLOCK_DRIFT";
    case "sync/out-of-sync":
      return "SYNC_OUT_OF_SYNC";
    case "sync/invalid-schema":
      return "SYNC_INVALID_SCHEMA";
    case "sync/encrypt-failure":
      return "SYNC_ENCRYPT_FAILED";
    case "sync/decrypt-failure":
      return "SYNC_DECRYPT_FAILED";
    case "sync/key-missing":
      return "SYNC_KEY_MISSING";
    case "file/upload-failed":
      return "FILE_UPLOAD_FAILED";
    case "file/download-failed":
      return "FILE_DOWNLOAD_FAILED";
    case "file/corrupt-archive":
      return "FILE_CORRUPT";
    case "file/delete-failed":
      return "FILE_DELETE_FAILED";
    case "file/switch-failed":
      return "FILE_SWITCH_FAILED";
    case "db/unavailable":
      return "DB_UNAVAILABLE";
    case "unknown/fatal":
    case "unknown/unexpected":
      return "UNKNOWN_UNEXPECTED";
  }
}

export function toErrorSeverity(code: ErrorCode): ErrorSeverity {
  switch (code) {
    case "NETWORK_OFFLINE":
    case "NETWORK_TIMEOUT":
    case "AUTH_INVALID_PASSWORD":
      return "WARNING";
    case "DB_UNAVAILABLE":
    case "SYNC_KEY_MISSING":
      return "CRITICAL";
    default:
      return "ERROR";
  }
}

export function toErrorSource(code: ErrorCode): ErrorSource {
  if (code.startsWith("NETWORK_")) return "NETWORK";
  if (code.startsWith("HTTP_")) return "HTTP";
  if (code.startsWith("AUTH_")) return "AUTH";
  if (code.startsWith("SYNC_")) return "SYNC";
  if (code.startsWith("FILE_")) return "FILES";
  if (code.startsWith("STORAGE_")) return "STORAGE";
  if (code.startsWith("DB_")) return "DATABASE";
  return "UNKNOWN";
}
