import { describe, it, expect, beforeEach } from "vitest";
import { useLastTransactionStore } from "../lastTransactionStore";

beforeEach(() => {
  useLastTransactionStore.getState().reset();
});

describe("lastTransactionStore", () => {
  it("starts empty — the first transaction of a session picks its own account", () => {
    expect(useLastTransactionStore.getState().accountId).toBeNull();
  });

  it("remembers the account it was given", () => {
    useLastTransactionStore.getState().setLastAccount("checking");
    expect(useLastTransactionStore.getState().accountId).toBe("checking");
  });

  it("forgets on reset, which is what a budget switch calls", () => {
    // The id belongs to one budget file and means nothing in the next.
    useLastTransactionStore.getState().setLastAccount("checking");
    useLastTransactionStore.getState().reset();
    expect(useLastTransactionStore.getState().accountId).toBeNull();
  });
});
