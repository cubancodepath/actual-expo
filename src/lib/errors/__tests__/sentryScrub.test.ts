import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/react-native";
import { scrubEvent } from "@/lib/errors/sentryScrub";

describe("scrubEvent", () => {
  it("drops sensitive keys from extra while keeping other keys intact", () => {
    const event = {
      extra: {
        preview: "plaintext archive contents",
        serverReason: "some raw server body",
        serverUrl: "https://my-server.example.com",
        keepMe: "fine",
      },
    } as unknown as ErrorEvent;

    const result = scrubEvent(event);

    expect(result.extra).not.toHaveProperty("preview");
    expect(result.extra).not.toHaveProperty("serverReason");
    expect(result.extra).not.toHaveProperty("serverUrl");
    expect(result.extra?.keepMe).toBe("fine");
  });

  it("scrubs sensitive keys nested inside context objects and truncates long strings", () => {
    const longString = "a".repeat(1000);
    const event = {
      contexts: {
        request: {
          token: "should-be-dropped",
          nested: {
            password: "should-be-dropped-too",
            note: longString,
            safe: "keep",
          },
        },
      },
    } as unknown as ErrorEvent;

    const result = scrubEvent(event);
    const request = result.contexts?.request as Record<string, unknown>;
    const nested = request.nested as Record<string, unknown>;

    expect(request).not.toHaveProperty("token");
    expect(nested).not.toHaveProperty("password");
    expect(nested.safe).toBe("keep");
    expect((nested.note as string).length).toBe(301);
    expect(nested.note).toBe(`${"a".repeat(300)}…`);
  });

  it("passes through an event without extras unchanged", () => {
    const event = {
      message: "something happened",
      level: "error",
    } as unknown as ErrorEvent;

    const result = scrubEvent(event);

    expect(result).toEqual(event);
  });
});
