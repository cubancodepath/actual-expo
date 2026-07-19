import type { ErrorEvent } from "@sentry/react-native";

/**
 * Keys (case-insensitive) that must never leave the device in a Sentry event.
 * Anyone adding new `ActualError` context keys with request/response content
 * must add them here too.
 */
const DROP_KEYS = new Set([
  "preview",
  "serverreason",
  "serverurl",
  "token",
  "password",
  "authorization",
  "cookie",
]);

const MAX_STRING_LENGTH = 300;

function truncate(value: string): string {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
}

/** Deep-walk a value, dropping sensitive keys and truncating long strings. */
function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return truncate(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item));
  }
  if (value !== null && typeof value === "object") {
    return scrubObject(value as Record<string, unknown>);
  }
  return value;
}

function scrubObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (DROP_KEYS.has(key.toLowerCase())) continue;
    result[key] = scrubValue(value);
  }
  return result;
}

/**
 * `beforeSend`/`beforeSendTransaction`-compatible scrubber: drops known
 * sensitive keys from `extra`, `contexts`, and breadcrumb `data`, and
 * truncates any remaining string values. This is the single choke point for
 * data minimization before events leave the device.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const scrubbed: ErrorEvent = { ...event };

  if (event.extra) {
    scrubbed.extra = scrubObject(event.extra as Record<string, unknown>);
  }

  if (event.contexts) {
    scrubbed.contexts = scrubObject(
      event.contexts as unknown as Record<string, unknown>,
    ) as ErrorEvent["contexts"];
  }

  if (event.breadcrumbs) {
    scrubbed.breadcrumbs = event.breadcrumbs.map((crumb) =>
      crumb.data ? { ...crumb, data: scrubObject(crumb.data as Record<string, unknown>) } : crumb,
    );
  }

  return scrubbed;
}
