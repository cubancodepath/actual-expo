import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// ── Fix date to 2026-03-05 so schedule tests are deterministic ────────────
vi.useFakeTimers();
vi.setSystemTime(new Date(2026, 2, 5, 12, 0, 0)); // March 5, 2026

// ── Define __DEV__ for test environment ───────────────────────────────────
(globalThis as any).__DEV__ = false;

// ── Mock all native/DB dependencies ──────────────────────────────────────

vi.mock("@/core/server/db", () => {
  // aqlQuery runs through db.all (alias of runQuery); mock both with one fn.
  const runQuery = vi.fn();
  return { first: vi.fn(), runQuery, all: runQuery, run: vi.fn() };
});

vi.mock("@/core/server/sync", () => ({
  sendMessages: vi.fn(),
  batchMessages: vi.fn((fn: () => Promise<void>) => fn()),
}));

vi.mock("@/core/server/undo", () => ({
  undoable: (fn: any) => fn,
}));

vi.mock("@/core/crdt", () => ({
  Timestamp: {
    send: () => "mock-timestamp",
  },
}));

vi.mock("@/core/server/rules", () => ({
  createRule: vi.fn().mockResolvedValue("rule-1"),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  getRuleById: vi.fn(),
  getRules: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/core/server/payees", () => ({
  findOrCreatePayee: vi.fn().mockResolvedValue("payee-1"),
}));

vi.mock("@/core/server/transactions", () => ({
  addTransaction: vi.fn().mockResolvedValue("txn-1"),
}));

vi.mock("@/core/server/preferences", () => ({
  getArbitraryPref: vi.fn().mockResolvedValue("7"),
}));

vi.mock("@/core/shared/months", () => ({
  currentDay: () => "2026-03-09",
  todayInt: () => 20260309,
  intToStr: (n: number) => {
    const s = String(n);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  },
  strToInt: (s: string) => {
    const clean = s.replace(/\D/g, "");
    return clean.length === 8 ? parseInt(clean, 10) : null;
  },
}));

import { first, runQuery } from "@/core/server/db";
import { sendMessages } from "@/core/server/sync";
import { getRuleById } from "@/core/server/rules";
import { setNextDate, advanceSchedules } from "../index";
import type { PreviewTransaction } from "../preview";
import type { TransactionDisplay } from "@/core/server/transactions";

const mockFirst = vi.mocked(first);
const mockRunQuery = vi.mocked(runQuery);
const mockSendMessages = vi.mocked(sendMessages);
const mockGetRuleById = vi.mocked(getRuleById);

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// setNextDate — non-regression guard
// ═══════════════════════════════════════════════════════════════════════════

describe("setNextDate", () => {
  const dailyRecurConfig = {
    frequency: "monthly" as const,
    start: "2026-03-09",
  };

  const dateCondition = {
    field: "date",
    op: "isapprox",
    value: dailyRecurConfig,
  };

  function setupScheduleNextDate(localNextDate: number | null) {
    // first() for rule lookup
    mockFirst.mockResolvedValueOnce({ rule: "rule-1" } as any);
    // getRuleById
    mockGetRuleById.mockResolvedValueOnce({
      id: "rule-1",
      conditions: [dateCondition],
      conditionsOp: "and",
      actions: [],
    } as any);
    // first() for schedules_next_date
    mockFirst.mockResolvedValueOnce({
      id: "nd-1",
      schedule_id: "sched-1",
      local_next_date: localNextDate,
      local_next_date_ts: Date.now(),
      base_next_date: localNextDate,
      base_next_date_ts: Date.now(),
    } as any);
  }

  it("newNextDate > nextDate → updates (advance works)", async () => {
    // Current: 2026-03-09 (20260309). Start after → next should be 2026-04-09 (20260409)
    setupScheduleNextDate(20260309);

    await setNextDate({
      id: "sched-1",
      start: (nextDate) => {
        // Advance past current date
        const d = new Date(2026, 2, 10, 12); // March 10
        return d;
      },
    });

    expect(mockSendMessages).toHaveBeenCalled();
    const messages = mockSendMessages.mock.calls[0][0];
    // Should set local_next_date to 20260409 (April 9)
    const dateMsg = messages.find((m: any) => m.column === "local_next_date");
    expect(dateMsg).toBeDefined();
    expect(dateMsg!.value).toBe(20260409);
  });

  it("newNextDate < nextDate → does NOT update (regression blocked)", async () => {
    // Current: 2026-04-09 (20260409). Computing from today → 2026-03-09 is earlier → blocked
    setupScheduleNextDate(20260409);

    await setNextDate({ id: "sched-1" });

    // Should NOT have sent any messages
    expect(mockSendMessages).not.toHaveBeenCalled();
  });

  it("newNextDate < nextDate + reset=true → DOES update", async () => {
    // Current: 2026-04-09. With reset, any date is allowed
    setupScheduleNextDate(20260409);

    await setNextDate({
      id: "sched-1",
      reset: true,
    });

    expect(mockSendMessages).toHaveBeenCalled();
    const messages = mockSendMessages.mock.calls[0][0];
    // Reset uses base_next_date column
    const dateMsg = messages.find((m: any) => m.column === "base_next_date");
    expect(dateMsg).toBeDefined();
  });

  it("newNextDate === nextDate → no update (no-op)", async () => {
    // Monthly from 2026-03-09, start from today → next is 2026-03-09 = same as current
    setupScheduleNextDate(20260309);

    // Start from today (default) → computeNextDate finds 2026-03-09 which equals nextDate
    await setNextDate({ id: "sched-1" });

    expect(mockSendMessages).not.toHaveBeenCalled();
  });

  it("nextDate is null → updates (first date assignment)", async () => {
    mockFirst.mockResolvedValueOnce({ rule: "rule-1" } as any);
    mockGetRuleById.mockResolvedValueOnce({
      id: "rule-1",
      conditions: [dateCondition],
      conditionsOp: "and",
      actions: [],
    } as any);
    mockFirst.mockResolvedValueOnce({
      id: "nd-1",
      schedule_id: "sched-1",
      local_next_date: null,
      local_next_date_ts: null,
      base_next_date: null,
      base_next_date_ts: null,
    } as any);

    await setNextDate({ id: "sched-1" });

    expect(mockSendMessages).toHaveBeenCalled();
  });

  it("conditions passed directly skips DB lookups", async () => {
    // Only needs schedules_next_date lookup
    mockFirst.mockResolvedValueOnce({
      id: "nd-1",
      schedule_id: "sched-1",
      local_next_date: 20260309,
      local_next_date_ts: Date.now(),
      base_next_date: 20260309,
      base_next_date_ts: Date.now(),
    } as any);

    await setNextDate({
      id: "sched-1",
      conditions: [dateCondition],
      start: () => new Date(2026, 2, 10, 12), // March 10
    });

    // Should not have looked up rule
    expect(mockGetRuleById).not.toHaveBeenCalled();
    // Should have updated
    expect(mockSendMessages).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// advanceSchedules
// ═══════════════════════════════════════════════════════════════════════════

describe("advanceSchedules", () => {
  const monthlyCond = { frequency: "monthly", start: "2026-03-09" };
  const postingConds = [
    { field: "payee", op: "is", value: "payee-1" },
    { field: "account", op: "is", value: "acct-1" },
    { field: "amount", op: "isapprox", value: -5000 },
    { field: "date", op: "isapprox", value: monthlyCond },
  ];

  function scheduleRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "sched-1",
      rule: "rule-1",
      completed: 0,
      posts_transaction: 0,
      tombstone: 0,
      local_next_date: 20260309,
      base_next_date: 20260309,
      conditions: JSON.stringify([{ field: "date", op: "isapprox", value: monthlyCond }]),
      ...overrides,
    };
  }

  // getSchedules → closed accounts → hasTransactions (executeQuery→runQuery)
  function mockAdvancePrelude(schedules: any[], paidIds: string[] = []) {
    mockRunQuery.mockResolvedValueOnce(schedules); // getSchedules
    mockRunQuery.mockResolvedValueOnce([]); // getClosedAccountIds
    mockRunQuery.mockResolvedValueOnce(paidIds.map((id) => ({ schedule: id, date: 20260309 }))); // getHasTransactionsQuery
  }

  it("status=paid + recurring → advances via setNextDate", async () => {
    mockAdvancePrelude([scheduleRow()], ["sched-1"]); // linked txn → paid

    // setNextDate internals: rule lookup + nd lookup
    mockFirst.mockResolvedValueOnce({ rule: "rule-1" } as any);
    mockGetRuleById.mockResolvedValueOnce({
      id: "rule-1",
      conditions: [{ field: "date", op: "isapprox", value: monthlyCond }],
      conditionsOp: "and",
      actions: [],
    } as any);
    mockFirst.mockResolvedValueOnce({
      id: "nd-1",
      schedule_id: "sched-1",
      local_next_date: 20260309,
      base_next_date: 20260309,
      base_next_date_ts: Date.now(),
    } as any);

    // paid + recurring but posts_transaction=0 → else-branch setNextDate; no throw.
    await expect(advanceSchedules(true)).resolves.toBeUndefined();
  });

  it("status=due + posts_transaction + syncSuccess → posts transaction", async () => {
    mockAdvancePrelude(
      [
        scheduleRow({
          id: "sched-2",
          rule: "rule-2",
          posts_transaction: 1,
          conditions: JSON.stringify(postingConds),
        }),
      ],
      [], // no linked txn → due
    );

    // postTransactionForSchedule → getScheduleById
    mockRunQuery.mockResolvedValueOnce([
      scheduleRow({
        id: "sched-2",
        rule: "rule-2",
        posts_transaction: 1,
        conditions: JSON.stringify(postingConds),
      }),
    ]);

    // catch-up: advanceRecurringScheduleFromNextDate → setNextDate + getScheduleById(advanced)
    mockFirst.mockResolvedValueOnce({ rule: "rule-2" } as any);
    mockGetRuleById.mockResolvedValueOnce({
      id: "rule-2",
      conditions: postingConds,
      conditionsOp: "and",
      actions: [],
    } as any);
    mockFirst.mockResolvedValueOnce({
      id: "nd-2",
      schedule_id: "sched-2",
      local_next_date: 20260309,
      base_next_date: 20260309,
      base_next_date_ts: Date.now(),
    } as any);
    // reloaded (advanced) schedule → next month, far future → loop ends
    mockRunQuery.mockResolvedValueOnce([
      scheduleRow({
        id: "sched-2",
        rule: "rule-2",
        posts_transaction: 1,
        local_next_date: 20260409,
        base_next_date: 20260409,
        conditions: JSON.stringify(postingConds),
      }),
    ]);
    // hasTransactionForSchedule(updated) → executeQuery → no rows
    mockRunQuery.mockResolvedValueOnce([]);

    const { addTransaction } = await import("@/core/server/transactions");
    const mockAddTransaction = vi.mocked(addTransaction);

    await advanceSchedules(true);

    expect(mockAddTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ account: "acct-1", amount: -5000, schedule: "sched-2" }),
    );
  });

  it("status=due + posts_transaction + !syncSuccess → does NOT post", async () => {
    mockAdvancePrelude(
      [
        scheduleRow({
          id: "sched-3",
          rule: "rule-3",
          posts_transaction: 1,
          conditions: JSON.stringify(postingConds),
        }),
      ],
      [],
    );

    const { addTransaction } = await import("@/core/server/transactions");
    const mockAddTransaction = vi.mocked(addTransaction);
    mockAddTransaction.mockClear();

    await advanceSchedules(false); // syncSuccess=false

    expect(mockAddTransaction).not.toHaveBeenCalled();
  });
});

afterAll(() => {
  vi.useRealTimers();
});
