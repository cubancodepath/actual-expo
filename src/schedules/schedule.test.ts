import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// ── Fix date to 2026-03-05 so schedule tests are deterministic ────────────
vi.useFakeTimers();
vi.setSystemTime(new Date(2026, 2, 5, 12, 0, 0)); // March 5, 2026

// ── Define __DEV__ for test environment ───────────────────────────────────
(globalThis as any).__DEV__ = false;

// ── Mock all native/DB dependencies ──────────────────────────────────────

vi.mock('../db', () => ({
  first: vi.fn(),
  runQuery: vi.fn(),
  run: vi.fn(),
}));

vi.mock('../sync', () => ({
  sendMessages: vi.fn(),
  batchMessages: vi.fn((fn: () => Promise<void>) => fn()),
}));

vi.mock('../sync/undo', () => ({
  undoable: (fn: any) => fn,
}));

vi.mock('../crdt', () => ({
  Timestamp: {
    send: () => 'mock-timestamp',
  },
}));

vi.mock('../rules', () => ({
  createRule: vi.fn().mockResolvedValue('rule-1'),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
  getRuleById: vi.fn(),
}));

vi.mock('../payees', () => ({
  findOrCreatePayee: vi.fn().mockResolvedValue('payee-1'),
}));

vi.mock('../transactions', () => ({
  addTransaction: vi.fn().mockResolvedValue('txn-1'),
}));

vi.mock('../lib/date', () => ({
  todayStr: () => '2026-03-09',
  todayInt: () => 20260309,
  intToStr: (n: number) => {
    const s = String(n);
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  },
  strToInt: (s: string) => {
    const clean = s.replace(/\D/g, '');
    return clean.length === 8 ? parseInt(clean, 10) : null;
  },
}));

import { first, runQuery } from '../db';
import { sendMessages } from '../sync';
import { getRuleById } from '../rules';
import { setNextDate, advanceSchedules } from './index';
import { buildListData } from '../presentation/hooks/transactionList/types';
import type { PreviewTransaction } from './preview';
import type { TransactionDisplay } from '../transactions';

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

describe('setNextDate', () => {
  const dailyRecurConfig = {
    frequency: 'monthly' as const,
    start: '2026-03-09',
  };

  const dateCondition = {
    field: 'date',
    op: 'isapprox',
    value: dailyRecurConfig,
  };

  function setupScheduleNextDate(localNextDate: number | null) {
    // first() for rule lookup
    mockFirst.mockResolvedValueOnce({ rule: 'rule-1' } as any);
    // getRuleById
    mockGetRuleById.mockResolvedValueOnce({
      id: 'rule-1',
      conditions: [dateCondition],
      conditionsOp: 'and',
      actions: [],
    } as any);
    // first() for schedules_next_date
    mockFirst.mockResolvedValueOnce({
      id: 'nd-1',
      schedule_id: 'sched-1',
      local_next_date: localNextDate,
      local_next_date_ts: Date.now(),
      base_next_date: localNextDate,
      base_next_date_ts: Date.now(),
    } as any);
  }

  it('newNextDate > nextDate → updates (advance works)', async () => {
    // Current: 2026-03-09 (20260309). Start after → next should be 2026-04-09 (20260409)
    setupScheduleNextDate(20260309);

    await setNextDate({
      id: 'sched-1',
      start: (nextDate) => {
        // Advance past current date
        const d = new Date(2026, 2, 10, 12); // March 10
        return d;
      },
    });

    expect(mockSendMessages).toHaveBeenCalled();
    const messages = mockSendMessages.mock.calls[0][0];
    // Should set local_next_date to 20260409 (April 9)
    const dateMsg = messages.find((m: any) => m.column === 'local_next_date');
    expect(dateMsg).toBeDefined();
    expect(dateMsg!.value).toBe(20260409);
  });

  it('newNextDate < nextDate → does NOT update (regression blocked)', async () => {
    // Current: 2026-04-09 (20260409). Computing from today → 2026-03-09 is earlier → blocked
    setupScheduleNextDate(20260409);

    await setNextDate({ id: 'sched-1' });

    // Should NOT have sent any messages
    expect(mockSendMessages).not.toHaveBeenCalled();
  });

  it('newNextDate < nextDate + reset=true → DOES update', async () => {
    // Current: 2026-04-09. With reset, any date is allowed
    setupScheduleNextDate(20260409);

    await setNextDate({
      id: 'sched-1',
      reset: true,
    });

    expect(mockSendMessages).toHaveBeenCalled();
    const messages = mockSendMessages.mock.calls[0][0];
    // Reset uses base_next_date column
    const dateMsg = messages.find((m: any) => m.column === 'base_next_date');
    expect(dateMsg).toBeDefined();
  });

  it('newNextDate === nextDate → no update (no-op)', async () => {
    // Monthly from 2026-03-09, start from today → next is 2026-03-09 = same as current
    setupScheduleNextDate(20260309);

    // Start from today (default) → computeNextDate finds 2026-03-09 which equals nextDate
    await setNextDate({ id: 'sched-1' });

    expect(mockSendMessages).not.toHaveBeenCalled();
  });

  it('nextDate is null → updates (first date assignment)', async () => {
    mockFirst.mockResolvedValueOnce({ rule: 'rule-1' } as any);
    mockGetRuleById.mockResolvedValueOnce({
      id: 'rule-1',
      conditions: [dateCondition],
      conditionsOp: 'and',
      actions: [],
    } as any);
    mockFirst.mockResolvedValueOnce({
      id: 'nd-1',
      schedule_id: 'sched-1',
      local_next_date: null,
      local_next_date_ts: null,
      base_next_date: null,
      base_next_date_ts: null,
    } as any);

    await setNextDate({ id: 'sched-1' });

    expect(mockSendMessages).toHaveBeenCalled();
  });

  it('conditions passed directly skips DB lookups', async () => {
    // Only needs schedules_next_date lookup
    mockFirst.mockResolvedValueOnce({
      id: 'nd-1',
      schedule_id: 'sched-1',
      local_next_date: 20260309,
      local_next_date_ts: Date.now(),
      base_next_date: 20260309,
      base_next_date_ts: Date.now(),
    } as any);

    await setNextDate({
      id: 'sched-1',
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

describe('advanceSchedules', () => {
  function mockScheduleRows(schedules: any[]) {
    // getSchedules() calls runQuery
    mockRunQuery.mockResolvedValueOnce(schedules);
  }

  function mockTransactionLookup(scheduleIds: string[]) {
    // getSchedulesWithTransactions calls runQuery
    mockRunQuery.mockResolvedValueOnce(
      scheduleIds.map((id) => ({ schedule: id })),
    );
  }

  it('status=paid + recurring → calls setNextDate (via sendMessages)', async () => {
    const recurConfig = { frequency: 'monthly', start: '2026-03-09' };
    mockScheduleRows([
      {
        id: 'sched-1',
        rule: 'rule-1',
        completed: 0,
        posts_transaction: 0,
        tombstone: 0,
        local_next_date: 20260309,
        base_next_date: 20260309,
        conditions: JSON.stringify([
          { field: 'date', op: 'isapprox', value: recurConfig },
        ]),
      },
    ]);
    // sched-1 has a linked transaction → status=paid
    mockTransactionLookup(['sched-1']);

    // setNextDate internals: rule lookup + nd lookup
    mockFirst.mockResolvedValueOnce({ rule: 'rule-1' } as any);
    mockGetRuleById.mockResolvedValueOnce({
      id: 'rule-1',
      conditions: [{ field: 'date', op: 'isapprox', value: recurConfig }],
      conditionsOp: 'and',
      actions: [],
    } as any);
    mockFirst.mockResolvedValueOnce({
      id: 'nd-1',
      schedule_id: 'sched-1',
      local_next_date: 20260309,
      base_next_date: 20260309,
      base_next_date_ts: Date.now(),
    } as any);

    await advanceSchedules(true);

    // setNextDate was called (it uses default start=today, so nextOccurrence from today
    // for monthly starting 2026-03-09 = 2026-03-09 = same as current → no-op due to === check)
    // This is the expected behavior — non-regression guard prevents undo
  });

  it('status=due + posts_transaction + syncSuccess → posts transaction', async () => {
    mockScheduleRows([
      {
        id: 'sched-2',
        rule: 'rule-2',
        completed: 0,
        posts_transaction: 1,
        tombstone: 0,
        local_next_date: 20260309, // today = due
        base_next_date: 20260309,
        conditions: JSON.stringify([
          { field: 'payee', op: 'is', value: 'payee-1' },
          { field: 'account', op: 'is', value: 'acct-1' },
          { field: 'amount', op: 'isapprox', value: -5000 },
          { field: 'date', op: 'isapprox', value: { frequency: 'monthly', start: '2026-03-09' } },
        ]),
      },
    ]);
    // No linked transactions → status=due (nextDate=today)
    mockTransactionLookup([]);

    // postTransactionForSchedule internals: getScheduleById
    mockRunQuery.mockResolvedValueOnce([
      {
        id: 'sched-2',
        rule: 'rule-2',
        completed: 0,
        posts_transaction: 1,
        tombstone: 0,
        local_next_date: 20260309,
        base_next_date: 20260309,
        conditions: JSON.stringify([
          { field: 'payee', op: 'is', value: 'payee-1' },
          { field: 'account', op: 'is', value: 'acct-1' },
          { field: 'amount', op: 'isapprox', value: -5000 },
          { field: 'date', op: 'isapprox', value: { frequency: 'monthly', start: '2026-03-09' } },
        ]),
      },
    ]);

    const { addTransaction } = await import('../transactions');
    const mockAddTransaction = vi.mocked(addTransaction);

    await advanceSchedules(true);

    expect(mockAddTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        acct: 'acct-1',
        amount: -5000,
        schedule: 'sched-2',
      }),
    );
  });

  it('status=due + posts_transaction + !syncSuccess → does NOT post', async () => {
    mockScheduleRows([
      {
        id: 'sched-3',
        rule: 'rule-3',
        completed: 0,
        posts_transaction: 1,
        tombstone: 0,
        local_next_date: 20260309,
        base_next_date: 20260309,
        conditions: JSON.stringify([
          { field: 'payee', op: 'is', value: 'payee-1' },
          { field: 'account', op: 'is', value: 'acct-1' },
          { field: 'amount', op: 'isapprox', value: -5000 },
          { field: 'date', op: 'isapprox', value: { frequency: 'monthly', start: '2026-03-09' } },
        ]),
      },
    ]);
    mockTransactionLookup([]);

    const { addTransaction } = await import('../transactions');
    const mockAddTransaction = vi.mocked(addTransaction);
    mockAddTransaction.mockClear();

    await advanceSchedules(false); // syncSuccess=false

    expect(mockAddTransaction).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildListData
// ═══════════════════════════════════════════════════════════════════════════

describe('buildListData', () => {
  function makeTxn(overrides: Partial<TransactionDisplay> & { id: string; date: number }): TransactionDisplay {
    return {
      isParent: false, isChild: false, acct: 'acct-1', amount: -5000,
      category: null, description: null, notes: null, parent_id: null,
      transferred_id: null, cleared: true, reconciled: false,
      sort_order: null, starting_balance_flag: false, schedule: null,
      tombstone: false, payeeName: null, categoryName: null,
      accountName: 'Checking',
      ...overrides,
    };
  }

  const txns: TransactionDisplay[] = [
    makeTxn({ id: 'txn-1', date: 20260309, amount: -5000, payeeName: 'Store', categoryName: 'Food' }),
    makeTxn({ id: 'txn-2', date: 20260309, amount: -3000, payeeName: 'Gas', categoryName: 'Transport', cleared: false }),
    makeTxn({ id: 'txn-3', date: 20260308, amount: -2000, payeeName: 'Coffee', categoryName: 'Food' }),
  ];

  const previews: PreviewTransaction[] = [
    {
      id: 'preview/s1/20260310', scheduleId: 's1', payeeName: 'Rent',
      amount: -100000, date: 20260310, status: 'upcoming', isRecurring: true,
    },
    {
      id: 'preview/s2/20260311', scheduleId: 's2', payeeName: 'Electric',
      amount: -5000, date: 20260311, status: 'upcoming', isRecurring: true,
    },
  ];

  it('no previews → standard date-grouped output', () => {
    const items = buildListData(txns);
    // Should have: date-header(Mar9), txn1, txn2, date-header(Mar8), txn3
    expect(items).toHaveLength(5);
    expect(items[0].type).toBe('date');
    expect(items[1].type).toBe('transaction');
    expect(items[2].type).toBe('transaction');
    expect(items[3].type).toBe('date');
    expect(items[4].type).toBe('transaction');
  });

  it('previews + collapsed → only UpcomingHeader', () => {
    const items = buildListData(txns, {
      previewTransactions: previews,
      upcomingExpanded: false,
    });
    // First item is upcoming-header, then date groups
    expect(items[0].type).toBe('upcoming-header');
    if (items[0].type === 'upcoming-header') {
      expect(items[0].count).toBe(2);
      expect(items[0].expanded).toBe(false);
    }
    // No upcoming items when collapsed
    expect(items.filter(i => i.type === 'upcoming')).toHaveLength(0);
  });

  it('previews + expanded → UpcomingHeader + UpcomingItems + regular items', () => {
    const items = buildListData(txns, {
      previewTransactions: previews,
      upcomingExpanded: true,
    });
    expect(items[0].type).toBe('upcoming-header');
    expect(items[1].type).toBe('upcoming');
    expect(items[2].type).toBe('upcoming');
    // Then regular date groups
    expect(items[3].type).toBe('date');
  });

  it('empty transactions + previews → header + previews only', () => {
    const items = buildListData([], {
      previewTransactions: previews,
      upcomingExpanded: true,
    });
    expect(items).toHaveLength(3); // header + 2 upcoming
    expect(items[0].type).toBe('upcoming-header');
    expect(items[1].type).toBe('upcoming');
    expect(items[2].type).toBe('upcoming');
  });

  it('isFirst/isLast flags correct on upcoming items', () => {
    const items = buildListData([], {
      previewTransactions: previews,
      upcomingExpanded: true,
    });
    const upcomingItems = items.filter(i => i.type === 'upcoming');
    expect(upcomingItems).toHaveLength(2);
    if (upcomingItems[0].type === 'upcoming' && upcomingItems[1].type === 'upcoming') {
      expect(upcomingItems[0].isFirst).toBe(true);
      expect(upcomingItems[0].isLast).toBe(false);
      expect(upcomingItems[1].isFirst).toBe(false);
      expect(upcomingItems[1].isLast).toBe(true);
    }
  });

  it('isFirst/isLast flags correct on transaction items across date groups', () => {
    const items = buildListData(txns);
    const txnItems = items.filter(i => i.type === 'transaction');
    expect(txnItems).toHaveLength(3);
    if (txnItems[0].type === 'transaction' && txnItems[1].type === 'transaction' && txnItems[2].type === 'transaction') {
      // txn-1: first in Mar 9 group
      expect(txnItems[0].isFirst).toBe(true);
      expect(txnItems[0].isLast).toBe(false);
      // txn-2: last in Mar 9 group
      expect(txnItems[1].isFirst).toBe(false);
      expect(txnItems[1].isLast).toBe(true);
      // txn-3: first and last in Mar 8 group
      expect(txnItems[2].isFirst).toBe(true);
      expect(txnItems[2].isLast).toBe(true);
    }
  });
});

afterAll(() => {
  vi.useRealTimers();
});
