import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActualError } from "@/core/errors";
import { useErrorStore, hasQueuedError } from "../errorStore";

beforeEach(() => {
  useErrorStore.getState().clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("errorStore", () => {
  it("pushes an error onto the queue", () => {
    const error = new ActualError("network/timeout");
    useErrorStore.getState().push(error, "toast");

    const queue = useErrorStore.getState().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0].error).toBe(error);
    expect(queue[0].display).toBe("toast");
    expect(hasQueuedError("network/timeout")).toBe(true);
  });

  it("dedupes the same code pushed twice within the dedup window", () => {
    useErrorStore.getState().push(new ActualError("http/server-error"), "toast");
    useErrorStore.getState().push(new ActualError("http/server-error"), "toast");

    expect(useErrorStore.getState().queue).toHaveLength(1);
  });

  it("allows the same code again after the dedup window passes", () => {
    vi.useFakeTimers();
    useErrorStore.getState().push(new ActualError("http/server-error"), "toast");

    vi.advanceTimersByTime(5_001);
    useErrorStore.getState().push(new ActualError("http/server-error"), "toast");

    expect(useErrorStore.getState().queue).toHaveLength(2);
  });

  it("does not dedupe different codes", () => {
    useErrorStore.getState().push(new ActualError("network/timeout"), "toast");
    useErrorStore.getState().push(new ActualError("http/server-error"), "toast");

    expect(useErrorStore.getState().queue).toHaveLength(2);
  });

  it("dismiss removes only the targeted entry", () => {
    useErrorStore.getState().push(new ActualError("network/timeout"), "toast");
    useErrorStore.getState().push(new ActualError("db/unavailable"), "dialog");
    const [first, second] = useErrorStore.getState().queue;

    useErrorStore.getState().dismiss(first.id);

    const queue = useErrorStore.getState().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(second.id);
  });

  it("clear empties the queue", () => {
    useErrorStore.getState().push(new ActualError("network/timeout"), "toast");
    useErrorStore.getState().clear();
    expect(useErrorStore.getState().queue).toHaveLength(0);
  });
});
