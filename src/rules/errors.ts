/**
 * RuleError — custom error for rule validation failures.
 * Ported from loot-core/src/server/errors.ts
 */

export class RuleError extends Error {
  type: string;

  constructor(type: string, message: string) {
    super("RuleError: " + message);
    this.type = type;
  }
}
