import { ActualError, type ErrorCode } from "@/core/errors";

/**
 * App-level error bus. Core THROWS typed `ActualError`s; the app layers
 * (stores, hooks, services, screens) catch and report them here. The only
 * subscriber today is ErrorChannelConsumer (log + Sentry).
 */
export type ErrorEvent = {
  id: string;
  code: ErrorCode;
  message: string;
  /** The original thrown value, untouched. */
  error: unknown;
  context?: Record<string, unknown>;
  createdAt: number;
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

  emit(event: Omit<ErrorEvent, "id" | "createdAt">): ErrorEvent {
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

/** The typed code of a thrown value — `unknown/unexpected` for anything untyped. */
export function toErrorCode(error: unknown): ErrorCode {
  return error instanceof ActualError ? error.code : "unknown/unexpected";
}

/**
 * Report an error to the bus. Deduplicates by error object identity so the
 * same throw reported at two layers (e.g. a hook and its screen) only emits once.
 */
export function emitErrorEvent(error: unknown, context?: Record<string, unknown>): ErrorEvent {
  const emittedKey = getObjectKey(error);
  const existingEvent = emittedKey ? emittedErrorEvents.get(emittedKey) : undefined;
  if (existingEvent) return existingEvent;

  const event = errorChannel.emit({
    code: toErrorCode(error),
    message: error instanceof Error ? error.message : String(error),
    error,
    context: error instanceof ActualError ? { ...error.context, ...context } : context,
  });

  if (emittedKey) emittedErrorEvents.set(emittedKey, event);
  return event;
}

function getObjectKey(value: unknown): object | null {
  if ((typeof value === "object" && value !== null) || typeof value === "function") return value;
  return null;
}
