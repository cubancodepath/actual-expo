/**
 * The #cleanup budget DSL — parsing note directives and evaluating/persisting
 * end-of-month cleanup. Mirrors loot-core/src/server/budget/cleanup-template.ts;
 * merged from the port's former budgets/cleanup/{parse,evaluate}.
 */

import type { CleanupTemplate, ParsedCleanupRow } from "@/core/types/models";
import { runQuery } from "@/core/server/db";
import { batchMessages } from "@/core/server/sync";
import { undoable } from "@/core/server/undo";
import { getBudgetMonth, setBudget, setBudgetGoal } from "./actions";
import { storeNoteCleanups } from "./cleanup-template-notes";

// ═══ former cleanup/parse.ts ═══

/** weight = `+w || 1`: only unsigned ints; 0 or missing collapse to 1. */
function coerceWeight(token: string | undefined): number {
  if (token === undefined) return 1;
  return parseInt(token, 10) || 1;
}

/**
 * Parse a single already-trimmed line. Returns null when the line is not a
 * valid `#cleanup` directive (unparseable lines are silently skipped upstream).
 * Mirrors `parse()`: the `#cleanup` literal is lowercase and needs ≥1 space.
 */
export function parseCleanupLine(line: string): ParsedCleanupRow | null {
  const head = /^#cleanup( +)(.*)$/.exec(line);
  if (!head) return null;
  const rest = head[2];

  // Alt 1: bare `source`
  if (rest === "source") return { type: "source", group: null };

  // Alt 2: `sink [_?] [weight]` (weight may be space-separated or adjacent)
  const sinkOnly = /^sink *(\d+)?$/.exec(rest);
  if (sinkOnly) return { type: "sink", group: null, weight: coerceWeight(sinkOnly[1]) };

  // Alt 3: `<group> source` — group is everything up to the first " source".
  const srcIdx = rest.indexOf(" source");
  if (srcIdx > 0) {
    const group = rest.slice(0, srcIdx);
    const after = rest.slice(srcIdx).replace(/^ +/, "");
    if (after === "source") return { type: "source", group };
  }

  // Alt 4: `[group] sink [weight]` — group is everything up to the first " sink".
  const sinkIdx = rest.indexOf(" sink");
  if (sinkIdx >= 0) {
    const group = rest.slice(0, sinkIdx);
    const after = rest.slice(sinkIdx).replace(/^ +/, "");
    const m = /^sink *(\d+)?$/.exec(after);
    if (m) return { type: "sink", group: group || null, weight: coerceWeight(m[1]) };
  }

  // Alt 5: bare group name (overspend member) — no " source" delimiter present.
  // (The grammar's sourcegroup only stops at " source", not " sink".)
  if (rest.length > 0 && rest.indexOf(" source") === -1) {
    return { type: "overspend", group: rest };
  }

  return null;
}

/**
 * Scan a category's note text and return every valid `#cleanup` directive.
 * Gate mirrors upstream: case-insensitive `#cleanup ` prefix test, but the line
 * is parsed with original casing (so `#Cleanup` passes the gate yet fails the
 * lowercase-literal parse and is skipped). Overspend rows with an empty group
 * are dropped.
 */
export function parseCleanupNote(note: string | null | undefined): ParsedCleanupRow[] {
  if (!note) return [];
  const rows: ParsedCleanupRow[] = [];
  for (const rawLine of note.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed.toLowerCase().startsWith("#cleanup ")) continue;
    const parsed = parseCleanupLine(trimmed);
    if (!parsed) continue;
    if (parsed.type === "overspend" && parsed.group === "") continue;
    rows.push(parsed);
  }
  return rows;
}

// ═══ former cleanup/evaluate.ts ═══

export type CleanupPlan = {
  ops: Array<{ categoryId: string; amount: number }>;
  goals: Array<{ categoryId: string; goal: number; longGoal: boolean }>;
  warnings: string[];
  summary: string;
};

type CatState = {
  id: string;
  name: string;
  isIncome: boolean;
  carryover: boolean;
  budgeted: number;
  balance: number;
};

export async function computeCleanup(month: string): Promise<CleanupPlan> {
  const bm = await getBudgetMonth(month);

  // Flatten categories in a deterministic order (groups → categories).
  const cats: CatState[] = [];
  const state = new Map<string, CatState>();
  for (const g of bm.groups) {
    for (const c of g.categories) {
      const s: CatState = {
        id: c.id,
        name: c.name,
        isIncome: g.is_income,
        carryover: c.carryover,
        budgeted: c.budgeted,
        balance: c.balance,
      };
      cats.push(s);
      state.set(c.id, s);
    }
  }

  let toBudget = bm.toBudget;
  const ops = new Map<string, number>();
  const goals = new Map<string, { goal: number; longGoal: boolean }>();
  const warnings: string[] = [];

  // Set a category's absolute budget, keeping the in-memory reads consistent
  // with what a fresh cell read would return after the write.
  function applyOp(id: string, amount: number): void {
    const s = state.get(id)!;
    const delta = amount - s.budgeted;
    s.budgeted = amount;
    s.balance += delta;
    toBudget -= delta;
    ops.set(id, amount);
  }

  // Load compiled cleanup directives.
  const defRows = await runQuery<{ id: string; cleanup_def: string }>(
    "SELECT id, cleanup_def FROM categories WHERE tombstone = 0 AND cleanup_def IS NOT NULL",
  );
  const groupNames = new Map<string, string>(
    (await runQuery<{ id: string; name: string }>("SELECT id, name FROM cleanup_groups")).map(
      (g) => [g.id, g.name],
    ),
  );

  type Directive = { categoryId: string } & CleanupTemplate;
  const groupSource: Directive[] = [];
  const groupSink: Directive[] = [];
  const groupOverspend: Directive[] = [];
  const globalSourceByCat = new Map<string, true>();
  const globalSinks: Array<{ categoryId: string; weight: number }> = [];

  for (const row of defRows) {
    if (!state.has(row.id)) continue;
    let def: CleanupTemplate[];
    try {
      def = JSON.parse(row.cleanup_def) as CleanupTemplate[];
    } catch {
      continue;
    }
    for (const d of def) {
      if (d.role === "source" && d.groupId) groupSource.push({ categoryId: row.id, ...d });
      else if (d.role === "sink" && d.groupId) groupSink.push({ categoryId: row.id, ...d });
      else if (d.role === "overspend") groupOverspend.push({ categoryId: row.id, ...d });
    }
    const globalSource = def.find((d) => d.role === "source" && d.groupId === null);
    if (globalSource) globalSourceByCat.set(row.id, true);
    const globalSink = def.find((d) => d.role === "sink" && d.groupId === null);
    if (globalSink && globalSink.role === "sink") {
      globalSinks.push({ categoryId: row.id, weight: globalSink.weight });
    }
  }

  let numSources = 0;
  let numSinks = 0;

  // ── Step A: group cleanups (first-seen group order) ──────────────────────
  const seenGroups: string[] = [];
  for (const s of groupSource) {
    if (s.groupId && !seenGroups.includes(s.groupId)) seenGroups.push(s.groupId);
  }
  for (const groupId of seenGroups) {
    const sources = groupSource.filter((d) => d.groupId === groupId);
    const sinks = groupSink.filter((d) => d.groupId === groupId);
    const overspend = groupOverspend.filter((d) => d.groupId === groupId);

    if (sinks.length === 0 && overspend.length === 0) {
      const name = groupNames.get(groupId) ?? groupId;
      warnings.push(`Cleanup group "${name}" has no matching sink categories.`);
      continue;
    }

    let available = 0;
    for (const src of sources) {
      const s = state.get(src.categoryId)!;
      const oldBalance = s.balance;
      applyOp(src.categoryId, s.budgeted - oldBalance); // pull the leftover back out
      available += oldBalance;
    }

    const totalWeight = sinks.reduce((sum, d) => sum + (d.role === "sink" ? d.weight : 0), 0);

    // Overspend first.
    for (const ov of overspend) {
      if (available <= 0) break;
      const s = state.get(ov.categoryId)!;
      if (s.balance < 0 && !s.carryover) {
        const shortfall = Math.abs(s.balance);
        if (shortfall <= available) {
          applyOp(ov.categoryId, s.budgeted + shortfall);
          available -= shortfall;
        } else {
          applyOp(ov.categoryId, s.budgeted + available);
          available = 0;
        }
      }
    }

    // Then sinks (weighted; available not decremented — faithful quirk).
    if (totalWeight > 0) {
      for (const sink of sinks) {
        if (available <= 0) break;
        const s = state.get(sink.categoryId)!;
        const weight = sink.role === "sink" ? sink.weight : 0;
        applyOp(sink.categoryId, s.budgeted + Math.round((weight / totalWeight) * available));
      }
    }
  }

  // ── Step B: global sources (+ goal) ──────────────────────────────────────
  for (const s of cats) {
    if (!globalSourceByCat.has(s.id)) continue;
    if (s.balance >= 0) {
      const goal = s.budgeted - s.balance;
      applyOp(s.id, goal);
      goals.set(s.id, { goal, longGoal: false });
      numSources++;
    } else {
      warnings.push(`${s.name} does not have available funds.`);
    }
  }
  numSinks = globalSinks.length;

  // ── Step C: auto-fund overspent categories from global To-Budget ─────────
  for (const s of cats) {
    if (s.balance < 0 && !s.isIncome && !s.carryover) {
      const shortfall = Math.abs(s.balance);
      if (shortfall <= toBudget) {
        applyOp(s.id, s.budgeted + shortfall);
      } else if (toBudget > 0) {
        applyOp(s.id, s.budgeted + toBudget);
      }
    }
  }

  // ── Step D: fill global sinks (weighted, last-sink clamp) ────────────────
  if (globalSinks.length > 0) {
    const budgetAvailable = toBudget;
    if (budgetAvailable < 0) warnings.push("Global: No funds are available to reallocate.");
    const totalWeight = globalSinks.reduce((sum, s) => sum + s.weight, 0);
    for (let i = 0; i < globalSinks.length; i++) {
      const sink = globalSinks[i];
      const s = state.get(sink.categoryId)!;
      let toB = s.budgeted + Math.round((sink.weight / totalWeight) * budgetAvailable);
      if (i === globalSinks.length - 1) {
        const currentAvailable = toBudget;
        if (toB > currentAvailable) toB = s.budgeted + currentAvailable;
      }
      applyOp(sink.categoryId, toB);
    }
  }

  // ── Step E: summary ──────────────────────────────────────────────────────
  let summary: string;
  if (numSources === 0) {
    summary = warnings.length > 0 ? warnings.join(" ") : "All categories were up to date.";
  } else {
    summary = `Successfully returned funds from ${numSources} source(s) and funded ${numSinks} sinking fund(s).`;
  }

  return {
    ops: [...ops.entries()].map(([categoryId, amount]) => ({ categoryId, amount })),
    goals: [...goals.entries()].map(([categoryId, g]) => ({ categoryId, ...g })),
    warnings,
    summary,
  };
}

/** Persist a computed plan (one undo entry). */
export const persistCleanup = undoable(async function persistCleanup(
  month: string,
  plan: CleanupPlan,
): Promise<void> {
  await batchMessages(async () => {
    for (const op of plan.ops) await setBudget(month, op.categoryId, op.amount);
    for (const g of plan.goals) await setBudgetGoal(month, g.categoryId, g.goal, g.longGoal);
  });
});

/**
 * Full cleanup action: recompile notes → compute → persist. Returns the summary.
 * This is the core entry a UI budget-month action would call.
 */
export async function cleanupTemplate(month: string): Promise<string> {
  await storeNoteCleanups();
  const plan = await computeCleanup(month);
  await persistCleanup(month, plan);
  return plan.summary;
}
