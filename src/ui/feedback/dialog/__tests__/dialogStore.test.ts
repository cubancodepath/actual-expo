import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dialog, settleDialog, useDialogStore } from "../dialogStore";

// Matches DIALOG_EXIT_MS in dialogStore.ts — how long a dismissed request stays
// mounted before the queue advances.
const EXIT_MS = 320;

beforeEach(() => {
  vi.useFakeTimers();
  useDialogStore.setState({ current: null, isOpen: false, queue: [] });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

/** Advance past the exit animation so the queue advances / state clears. */
function flushExit() {
  vi.advanceTimersByTime(EXIT_MS);
}

/** Title of the currently active request (throws if none, keeping tests strict). */
function activeTitle(): string {
  const { current } = useDialogStore.getState();
  if (!current) throw new Error("no active dialog");
  return (current.opts as { title: string }).title;
}

describe("dialog.confirm", () => {
  it("resolves true when confirmed", async () => {
    const promise = dialog.confirm({ title: "Delete?" });
    expect(useDialogStore.getState().isOpen).toBe(true);

    settleDialog(true); // what DialogHost's confirm button calls
    await expect(promise).resolves.toBe(true);
  });

  it("resolves false on dismiss", async () => {
    const promise = dialog.confirm({ title: "Delete?" });
    dialog.dismiss();
    await expect(promise).resolves.toBe(false);
    flushExit();
    expect(useDialogStore.getState().current).toBeNull();
  });
});

describe("dialog.choose", () => {
  it("resolves null on dismiss", async () => {
    const promise = dialog.choose({
      title: "Delete file",
      actions: [{ key: "local", label: "Local" }],
    });
    dialog.dismiss();
    await expect(promise).resolves.toBeNull();
  });
});

describe("dialog.alert", () => {
  it("resolves undefined on dismiss", async () => {
    const promise = dialog.alert({ title: "Heads up" });
    dialog.dismiss();
    await expect(promise).resolves.toBeUndefined();
  });
});

describe("dialog.custom", () => {
  it("resolves the value passed to close", async () => {
    const promise = dialog.custom<string>({ render: () => null });
    expect(useDialogStore.getState().current?.kind).toBe("custom");

    // DialogHost wires ctx.close to settleDialog(value); emulate that call.
    settleDialog("secret");
    await expect(promise).resolves.toBe("secret");
  });
});

describe("queueing", () => {
  it("shows one dialog at a time and advances FIFO after the exit delay", async () => {
    const first = dialog.confirm({ title: "First" });
    const second = dialog.confirm({ title: "Second" });

    // Only the first is visible; the second waits in the queue.
    expect(activeTitle()).toBe("First");
    expect(useDialogStore.getState().queue).toHaveLength(1);

    dialog.dismiss();
    await expect(first).resolves.toBe(false);

    // Not yet swapped — still animating out.
    expect(activeTitle()).toBe("First");
    expect(useDialogStore.getState().isOpen).toBe(false);

    flushExit();

    // Second is now the active, visible dialog.
    expect(activeTitle()).toBe("Second");
    expect(useDialogStore.getState().isOpen).toBe(true);
    expect(useDialogStore.getState().queue).toHaveLength(0);

    dialog.dismiss();
    await expect(second).resolves.toBe(false);
    flushExit();
    expect(useDialogStore.getState().current).toBeNull();
  });

  it("ignores a second dismiss while animating out", async () => {
    const promise = dialog.confirm({ title: "Only" });
    dialog.dismiss();
    dialog.dismiss(); // no-op: already settling
    await expect(promise).resolves.toBe(false);
    flushExit();
    expect(useDialogStore.getState().current).toBeNull();
  });
});
