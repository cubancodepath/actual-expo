/**
 * Rule class — wraps conditions and actions into a single rule.
 * Ported from loot-core/src/server/rules/rule.ts
 *
 * Note: Split transaction handling (execSplitActions) is simplified
 * since the mobile app doesn't yet support split transaction creation via rules.
 */

import { Action } from "./action";
import { Condition } from "./condition";

function execNonSplitActions(
  actions: Action[],
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const update = transaction;
  for (const action of actions) {
    action.exec(update);
  }
  return update;
}

export function execActions(
  actions: Action[],
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  const parentActions = actions.filter((action) => !action.options?.splitIndex);
  // For now, we only handle non-split actions on mobile
  return execNonSplitActions(parentActions, transaction);
}

export class Rule {
  actions: Action[];
  conditions: Condition[];
  conditionsOp: "and" | "or";
  id?: string;
  stage: "pre" | null | "post";

  constructor({
    id,
    stage,
    conditionsOp,
    conditions,
    actions,
  }: {
    id?: string;
    stage?: "pre" | null | "post";
    conditionsOp: "and" | "or";
    conditions: Array<{
      op: string;
      field: string;
      value: unknown;
      options?: Record<string, unknown>;
    }>;
    actions: Array<{
      op: string;
      field?: string;
      value: unknown;
      options?: Record<string, unknown>;
    }>;
  }) {
    this.id = id;
    this.stage = stage ?? null;
    this.conditionsOp = conditionsOp;
    this.conditions = conditions.map((c) => new Condition(c.op, c.field, c.value, c.options));
    this.actions = actions.map((a) => new Action(a.op, a.field ?? null, a.value, a.options));
  }

  evalConditions(object: Record<string, unknown>): boolean {
    if (this.conditions.length === 0) return false;
    const method = this.conditionsOp === "or" ? "some" : "every";
    return this.conditions[method]((condition) => condition.eval(object));
  }

  execActions<T extends Record<string, unknown>>(object: T): Partial<T> {
    const result = execActions(this.actions, { ...object });
    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(result)) {
      if (result[key] !== object[key]) {
        changes[key] = result[key];
      }
    }
    return changes as Partial<T>;
  }

  exec(object: Record<string, unknown>): Partial<Record<string, unknown>> | null {
    if (this.evalConditions(object)) {
      return this.execActions(object);
    }
    return null;
  }

  apply(object: Record<string, unknown>): Record<string, unknown> {
    const changes = this.exec(object);
    return Object.assign({}, object, changes);
  }

  getId(): string | undefined {
    return this.id;
  }

  serialize(): Record<string, unknown> {
    return {
      id: this.id,
      stage: this.stage,
      conditionsOp: this.conditionsOp,
      conditions: this.conditions.map((c) => c.serialize()),
      actions: this.actions.map((a) => a.serialize()),
    };
  }
}
