import { describe, it, expect, vi, afterEach } from "vitest";
import { listen, emit, setSyncEventsMuted } from "../syncEvents";

describe("syncEvents", () => {
  afterEach(() => {
    setSyncEventsMuted(false);
  });

  it("delivers events to listeners", () => {
    const fn = vi.fn();
    const unlisten = listen(fn);
    emit({ type: "applied", tables: ["accounts"] });
    expect(fn).toHaveBeenCalledWith({ type: "applied", tables: ["accounts"] });
    unlisten();
  });

  it("drops events while muted and resumes after unmute", () => {
    const fn = vi.fn();
    const unlisten = listen(fn);

    setSyncEventsMuted(true);
    emit({ type: "applied", tables: ["accounts"] });
    expect(fn).not.toHaveBeenCalled();

    setSyncEventsMuted(false);
    emit({ type: "applied", tables: ["accounts"] });
    expect(fn).toHaveBeenCalledTimes(1);
    unlisten();
  });
});
