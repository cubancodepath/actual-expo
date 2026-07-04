import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActualError } from "../ActualError";
// Import the module object so we can reset its internal `sink`/buffer state
// between tests without a real module reset (vitest shares the module cache
// across tests in a file).
import * as reportModule from "../report";

const { reportError, setErrorSink } = reportModule;

function resetSink() {
  // No public "uninstall" — tests set a no-op sink to isolate state, since
  // reportError always requires *a* sink or it buffers instead of dropping.
  setErrorSink(() => {});
}

describe("reportError", () => {
  beforeEach(() => {
    resetSink();
  });

  it("normalizes the error and hands it to the installed sink", () => {
    const sink = vi.fn();
    setErrorSink(sink);

    reportError(new ActualError("network/timeout"));

    expect(sink).toHaveBeenCalledTimes(1);
    const reported = sink.mock.calls[0][0];
    expect(reported.error.code).toBe("network/timeout");
    expect(reported.display).toBe("toast");
    expect(reported.sentry).toBe(false);
  });

  it("merges reportError's context into the error's own context", () => {
    const sink = vi.fn();
    setErrorSink(sink);

    reportError(new ActualError("file/upload-failed", { context: { status: 500 } }), {
      context: { op: "createAccount" },
    });

    const reported = sink.mock.calls[0][0];
    expect(reported.error.context).toEqual({ status: 500, op: "createAccount" });
  });

  it("forces display to silent when inlineHandled is set, regardless of policy", () => {
    const sink = vi.fn();
    setErrorSink(sink);

    // http/server-error's policy is display: "toast" — inlineHandled overrides it.
    reportError(new ActualError("http/server-error"), { inlineHandled: true });

    expect(sink.mock.calls[0][0].display).toBe("silent");
  });

  it("looks up the policy for the normalized code, not the original throwable", () => {
    const sink = vi.fn();
    setErrorSink(sink);

    reportError(new Error("Network request failed"));

    const reported = sink.mock.calls[0][0];
    expect(reported.error.code).toBe("network/offline");
    expect(reported.display).toBe("silent");
  });

  it("returns the normalized ActualError to the caller", () => {
    setErrorSink(() => {});
    const result = reportError("just a string");
    expect(result).toBeInstanceOf(ActualError);
    expect(result.code).toBe("unknown/unexpected");
  });

  it("buffers reports made before a sink is installed and flushes them on install", async () => {
    // Simulate "no sink yet" by re-importing report.ts (and its ActualError
    // dependency) in isolation, since resetSink() above already installed a
    // no-op sink for other tests. Both modules must come from the same fresh
    // registry so `instanceof ActualError` checks inside report.ts still hold.
    vi.resetModules();
    const { reportError: freshReport, setErrorSink: freshSet } = await import("../report");
    const { ActualError: FreshActualError } = await import("../ActualError");

    freshReport(new FreshActualError("db/unavailable"));

    const sink = vi.fn();
    freshSet(sink);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0].error.code).toBe("db/unavailable");
  });
});
