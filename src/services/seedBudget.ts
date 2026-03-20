import { randomUUID } from "expo-crypto";
import { batchMessages, sendMessages } from "../sync";
import { Timestamp } from "../crdt";
import { createAccount } from "../accounts";
import { createCategoryGroup, createCategory } from "../categories";
import { refreshAllRegisteredStores } from "../stores/storeRegistry";

// ---------------------------------------------------------------------------
// Default category data — matches what Actual Budget server bundles
// ---------------------------------------------------------------------------

export const DEFAULT_CATEGORY_GROUPS = [
  {
    key: "usual",
    name: "Usual Expenses",
    is_income: false,
    categories: [
      { key: "food", name: "Food" },
      { key: "general", name: "General" },
      { key: "bills", name: "Bills" },
      { key: "bills_flexible", name: "Bills (Flexible)" },
    ],
  },
  {
    key: "income",
    name: "Income",
    is_income: true,
    categories: [
      { key: "income", name: "Income" },
      { key: "starting_balances", name: "Starting Balances" },
    ],
  },
  {
    key: "investments",
    name: "Investments and Savings",
    is_income: false,
    categories: [{ key: "savings", name: "Savings" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Category selection helpers
// ---------------------------------------------------------------------------

export type CategorySelection = Record<string, boolean>;

export function getDefaultCategorySelection(): CategorySelection {
  const sel: CategorySelection = {};
  for (const group of DEFAULT_CATEGORY_GROUPS) {
    for (const cat of group.categories) {
      sel[cat.key] = true;
    }
  }
  return sel;
}

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

export async function seedLocalBudget(opts: {
  accountName: string;
  startingBalance: number;
  selectedCategories: CategorySelection;
}): Promise<void> {
  const { accountName, startingBalance, selectedCategories } = opts;

  // Create categories first in a batch so they're committed to the DB
  // before createAccount queries for "Starting Balances" category.
  await batchMessages(async () => {
    let groupSort = 1000;

    for (const group of DEFAULT_CATEGORY_GROUPS) {
      const hasSelected = group.categories.some((c) => selectedCategories[c.key]);

      // Always create Income group (required by getStartingBalancePayee)
      if (!hasSelected && !group.is_income) {
        groupSort += 1000;
        continue;
      }

      const groupId = await createCategoryGroup({
        name: group.name,
        is_income: group.is_income,
        sort_order: groupSort,
      });
      groupSort += 1000;

      let catSort = 1000;
      for (const cat of group.categories) {
        // Always create "Starting Balances" (required by createAccount)
        if (!selectedCategories[cat.key] && cat.key !== "starting_balances") {
          catSort += 1000;
          continue;
        }

        await createCategory({
          name: cat.name,
          cat_group: groupId,
          is_income: group.is_income,
          sort_order: catSort,
        });
        catSort += 1000;
      }
    }
  });

  // Create account separately — it queries the DB for the "Starting Balances"
  // category and payee, which must already be committed.
  await createAccount({ name: accountName, offbudget: false }, startingBalance);

  // Seed default dashboard (required by desktop app — without this, dashboard is stuck loading)
  await seedDashboard();

  await refreshAllRegisteredStores();
}

// ---------------------------------------------------------------------------
// Default dashboard — matches loot-core migration 1722804019000 + 1765518577215
// ---------------------------------------------------------------------------

const DEFAULT_DASHBOARD_WIDGETS: Array<{
  type: string;
  width: number;
  height: number;
  x: number;
  y: number;
  meta: string | null;
}> = [
  {
    type: "summary-card",
    width: 3,
    height: 2,
    x: 0,
    y: 0,
    meta: JSON.stringify({
      name: "Total Income (YTD)",
      content: '{"type":"sum","fontSize":20}',
      timeFrame: { start: "2024-01-01", end: "2024-12-31", mode: "yearToDate" },
      conditions: [
        { field: "amount", op: "gt", value: 0 },
        { field: "account", op: "onBudget", value: "" },
        { field: "transfer", op: "is", value: false },
      ],
      conditionsOp: "and",
    }),
  },
  {
    type: "summary-card",
    width: 3,
    height: 2,
    x: 3,
    y: 0,
    meta: JSON.stringify({
      name: "Total Expenses (YTD)",
      content: '{"type":"sum","fontSize":20}',
      timeFrame: { start: "2024-01-01", end: "2024-12-31", mode: "yearToDate" },
      conditions: [
        { field: "amount", op: "lt", value: 0 },
        { field: "account", op: "onBudget", value: "" },
        { field: "transfer", op: "is", value: false },
      ],
      conditionsOp: "and",
    }),
  },
  {
    type: "summary-card",
    width: 3,
    height: 2,
    x: 6,
    y: 0,
    meta: JSON.stringify({
      name: "Avg Per Month",
      content: '{"type":"avgPerMonth","fontSize":20}',
      timeFrame: { start: "2024-01-01", end: "2024-12-31", mode: "yearToDate" },
      conditions: [
        { field: "amount", op: "lt", value: 0 },
        { field: "account", op: "onBudget", value: "" },
        { field: "transfer", op: "is", value: false },
      ],
      conditionsOp: "and",
    }),
  },
  {
    type: "summary-card",
    width: 3,
    height: 2,
    x: 9,
    y: 0,
    meta: JSON.stringify({
      name: "Avg Per Transaction",
      content: '{"type":"avgPerTransact","fontSize":20}',
      timeFrame: { start: "2024-01-01", end: "2024-12-31", mode: "yearToDate" },
      conditions: [
        { field: "amount", op: "lt", value: 0 },
        { field: "account", op: "onBudget", value: "" },
        { field: "transfer", op: "is", value: false },
      ],
      conditionsOp: "and",
    }),
  },
  { type: "net-worth-card", width: 6, height: 2, x: 0, y: 2, meta: null },
  { type: "cash-flow-card", width: 6, height: 2, x: 6, y: 2, meta: null },
  {
    type: "spending-card",
    width: 4,
    height: 2,
    x: 0,
    y: 5,
    meta: JSON.stringify({ name: "This Month", mode: "single-month" }),
  },
  {
    type: "spending-card",
    width: 4,
    height: 2,
    x: 4,
    y: 5,
    meta: JSON.stringify({ name: "Budget Overview", mode: "budget" }),
  },
  {
    type: "spending-card",
    width: 4,
    height: 2,
    x: 8,
    y: 5,
    meta: JSON.stringify({ name: "3-Month Average", mode: "average" }),
  },
  {
    type: "calendar-card",
    width: 8,
    height: 4,
    x: 0,
    y: 8,
    meta: JSON.stringify({
      name: "Transaction Calendar",
      timeFrame: { start: "2024-01-01", end: "2024-03-31", mode: "sliding-window" },
      conditions: [{ field: "transfer", op: "is", value: false }],
      conditionsOp: "and",
    }),
  },
  {
    type: "markdown-card",
    width: 4,
    height: 2,
    x: 8,
    y: 10,
    meta: JSON.stringify({
      content:
        "## Dashboard Tips\n\nYou can add new widgets or edit existing widgets by using the buttons at the top of the page.",
    }),
  },
];

async function seedDashboard(): Promise<void> {
  await batchMessages(async () => {
    const pageId = randomUUID();

    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "dashboard_pages",
        row: pageId,
        column: "name",
        value: "Main",
      },
      {
        timestamp: Timestamp.send()!,
        dataset: "dashboard_pages",
        row: pageId,
        column: "tombstone",
        value: 0,
      },
    ]);

    for (const widget of DEFAULT_DASHBOARD_WIDGETS) {
      const widgetId = randomUUID();
      await sendMessages([
        {
          timestamp: Timestamp.send()!,
          dataset: "dashboard",
          row: widgetId,
          column: "type",
          value: widget.type,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "dashboard",
          row: widgetId,
          column: "width",
          value: widget.width,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "dashboard",
          row: widgetId,
          column: "height",
          value: widget.height,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "dashboard",
          row: widgetId,
          column: "x",
          value: widget.x,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "dashboard",
          row: widgetId,
          column: "y",
          value: widget.y,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "dashboard",
          row: widgetId,
          column: "meta",
          value: widget.meta,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "dashboard",
          row: widgetId,
          column: "dashboard_page_id",
          value: pageId,
        },
        {
          timestamp: Timestamp.send()!,
          dataset: "dashboard",
          row: widgetId,
          column: "tombstone",
          value: 0,
        },
      ]);
    }
  });
}
