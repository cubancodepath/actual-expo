/**
 * RuleIndexer — efficient rule lookup by field value.
 * Ported from loot-core/src/server/rules/rule-indexer.ts
 */

import type { Rule } from "./rule";
import { fastSetMerge } from "./rule-utils";

export class RuleIndexer {
  field: string;
  method?: string;
  rules: Map<string | null, Set<Rule>>;

  constructor({ field, method }: { field: string; method?: string }) {
    this.field = field;
    this.method = method;
    this.rules = new Map();
  }

  getIndex(key: string | null): Set<Rule> {
    if (!this.rules.has(key)) {
      this.rules.set(key, new Set());
    }
    return this.rules.get(key)!;
  }

  getIndexForValue(value: unknown): Set<Rule> {
    return this.getIndex(this.getKey(value) || "*");
  }

  getKey(value: unknown): string | null {
    if (typeof value === "string" && value !== "") {
      if (this.method === "firstchar") {
        return value[0].toLowerCase();
      }
      return value.toLowerCase();
    }
    return null;
  }

  getIndexes(rule: Rule): Set<Rule>[] {
    const cond = rule.conditions.find((c) => c.field === this.field);
    const indexes: Set<Rule>[] = [];

    if (
      cond &&
      (cond.op === "oneOf" || cond.op === "is" || cond.op === "isNot" || cond.op === "notOneOf")
    ) {
      if (cond.op === "oneOf" || cond.op === "notOneOf") {
        (cond.value as unknown[]).forEach((val) => indexes.push(this.getIndexForValue(val)));
      } else {
        indexes.push(this.getIndexForValue(cond.value));
      }
    } else {
      indexes.push(this.getIndex("*"));
    }

    return indexes;
  }

  index(rule: Rule): void {
    const indexes = this.getIndexes(rule);
    for (const idx of indexes) {
      idx.add(rule);
    }
  }

  remove(rule: Rule): void {
    const indexes = this.getIndexes(rule);
    for (const idx of indexes) {
      idx.delete(rule);
    }
  }

  getApplicableRules(object: Record<string, unknown>): Set<Rule> {
    let indexedRules: Set<Rule> | undefined;
    if (this.field in object) {
      const key = this.getKey(object[this.field]);
      if (key) {
        indexedRules = this.rules.get(key);
      }
    }

    return fastSetMerge(indexedRules || new Set(), this.rules.get("*") || new Set());
  }
}
