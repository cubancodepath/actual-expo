import { describe, it, expect, beforeEach } from "vitest";
import { busy, useBusyStore } from "../busyStore";

const state = () => useBusyStore.getState();

describe("busy service", () => {
  beforeEach(() => {
    useBusyStore.setState({ count: 0, message: null, progress: null });
  });

  it("shows during run and cleans up after", async () => {
    const result = await busy.run(
      async () => {
        expect(state().count).toBe(1);
        expect(state().message).toBe("Opening…");
        return 42;
      },
      { message: "Opening…" },
    );

    expect(result).toBe(42);
    expect(state()).toMatchObject({ count: 0, message: null, progress: null });
  });

  it("always cleans up when the wrapped fn throws", async () => {
    await expect(
      busy.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(state()).toMatchObject({ count: 0, message: null, progress: null });
  });

  it("is re-entrant: nested runs keep the overlay up until the last one ends", async () => {
    let innerDone!: () => void;
    const inner = new Promise<void>((r) => {
      innerDone = r;
    });

    const outer = busy.run(async () => {
      const nested = busy.run(() => inner, { message: "inner" });
      expect(state().count).toBe(2);
      innerDone();
      await nested;
      expect(state().count).toBe(1);
    });

    await outer;
    expect(state().count).toBe(0);
  });

  it("updates message and progress only while running", async () => {
    busy.setMessage("ignored");
    busy.setProgress(1, 2);
    expect(state().message).toBeNull();
    expect(state().progress).toBeNull();

    await busy.run(async () => {
      busy.setMessage("phase 2");
      busy.setProgress(3, 10);
      expect(state().message).toBe("phase 2");
      expect(state().progress).toEqual({ done: 3, total: 10 });

      // A new phase message invalidates the previous phase's progress.
      busy.setMessage("phase 3");
      expect(state().progress).toBeNull();
    });

    expect(state()).toMatchObject({ count: 0, message: null, progress: null });
  });
});
