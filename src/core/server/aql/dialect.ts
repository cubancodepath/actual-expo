/**
 * SQL dialect seam for the AQL compiler.
 *
 * Upstream's compiler emits custom SQL scalar functions (UNICODE_LOWER/UPPER,
 * UNICODE_LIKE, NORMALISE, REGEXP) that better-sqlite3 registers at connection
 * open. expo-sqlite (~55) has NO scalar-function registration API, so we inject
 * a dialect that maps those to SQLite built-ins. This equals the behavior of the
 * previous hand-written flat compiler — zero regression:
 *   - UNICODE_LOWER  → LOWER
 *   - UNICODE_LIKE + NORMALISE(field) → plain `field LIKE pattern` (the literal
 *     pattern is still folded JS-side by the compiler via getNormalisedString;
 *     the SQL-side field NORMALISE is dropped — a documented narrowing that
 *     matches current behavior).
 *   - $nocase → COLLATE NOCASE
 *   - REGEXP → unsupported (regexp is never emitted by this app: rule
 *     `matches`/`hasTags`/`hasAnyTag` matching goes through the in-memory
 *     `Condition.eval` path, see core/server/forecast/forecast-filters.ts).
 *
 * All dialect functions operate on already-serialized SQL fragment strings.
 */

export type SqlDialect = {
  /** $lower(arg) */
  lower(arg: string): string;
  /** $like: field text LIKE (already JS-folded) pattern */
  like(pattern: string, text: string): string;
  /** $notlike */
  notlike(pattern: string, text: string): string;
  /** $nocase(arg) */
  nocase(arg: string): string;
  /** $regexp; null = not emittable in SQL on this platform */
  regexp: null | ((pattern: string, text: string) => string);
};

/** Thrown if a query ever tries to compile `$regexp` on a dialect without it. */
export class RegexpUnsupportedError extends Error {
  constructor() {
    super(
      "$regexp is not supported by the expo-sqlite dialect; match regexp/tag " +
        "conditions in-memory (Condition.eval) instead.",
    );
    this.name = "RegexpUnsupportedError";
  }
}

/** Default dialect for expo-sqlite: SQLite built-ins only, no custom functions. */
export const expoDialect: SqlDialect = {
  lower: (arg) => `LOWER(${arg})`,
  like: (pattern, text) => `${text} LIKE ${pattern}`,
  notlike: (pattern, text) => `(NOT ${text} LIKE ${pattern}\n OR ${text} IS NULL)`,
  nocase: (arg) => `${arg} COLLATE NOCASE`,
  regexp: null,
};
