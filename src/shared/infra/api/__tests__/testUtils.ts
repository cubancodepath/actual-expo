import { afterEach, beforeEach, expect, vi } from "vitest";
import { ActualError, type ErrorCode } from "@/core/errors";

export const SERVER = "https://budget.example.com";

export let fetchMock: ReturnType<typeof vi.fn>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function expectActualError(promise: Promise<unknown>, code: ErrorCode) {
  const error = await promise.then(
    () => {
      throw new Error("expected rejection");
    },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ActualError);
  expect((error as ActualError).code).toBe(code);
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
