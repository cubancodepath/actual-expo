import { runQuery } from "../db";
import type { TransactionRow } from "../db/types";
import type { TransactionDisplay } from "./types";

// Re-export from shared location for backward compatibility
export { ALIVE_TX_FILTER } from "../db/filters";

/** 5-table JOIN block that resolves payee and category names (via mapping tables). */
const DISPLAY_JOINS = `
  LEFT JOIN payee_mapping    pm ON pm.id = t.description
  LEFT JOIN payees            p ON COALESCE(pm.targetId, t.description) = p.id AND p.tombstone = 0
  LEFT JOIN accounts     tr_acc ON p.transfer_acct = tr_acc.id AND tr_acc.tombstone = 0
  LEFT JOIN category_mapping cm ON cm.id = t.category
  LEFT JOIN categories        c ON COALESCE(cm.transferId, t.category) = c.id AND c.tombstone = 0`;

/** Base display columns: payee name (with transfer account fallback) + category name. */
const DISPLAY_SELECT = `t.*,
    COALESCE(tr_acc.name, p.name) AS payee_name,
    c.name AS category_name`;

/** Correlated subqueries that fetch split-transaction category names and amounts. */
const SPLIT_SELECT = `,
    (SELECT GROUP_CONCAT(COALESCE(c2.name, ''), '||')
     FROM transactions ch
     LEFT JOIN category_mapping cm2 ON cm2.id = ch.category
     LEFT JOIN categories c2 ON COALESCE(cm2.transferId, ch.category) = c2.id AND c2.tombstone = 0
     WHERE ch.parent_id = t.id AND ch.tombstone = 0
    ) AS split_category_names,
    (SELECT GROUP_CONCAT(ch.amount, '||')
     FROM transactions ch
     WHERE ch.parent_id = t.id AND ch.tombstone = 0
    ) AS split_category_amounts`;

// ---------------------------------------------------------------------------
// Raw row type returned by display queries
// ---------------------------------------------------------------------------

type RawDisplayRow = TransactionRow & {
  payee_name: string | null;
  category_name: string | null;
  account_name?: string | null;
  split_category_names?: string | null;
  split_category_amounts?: string | null;
};

// ---------------------------------------------------------------------------
// Shared row mapper — single source of truth for DB row → TransactionDisplay
// ---------------------------------------------------------------------------

function rowToDisplay(r: RawDisplayRow): TransactionDisplay {
  return {
    id: r.id,
    is_parent: r.isParent === 1,
    is_child: r.isChild === 1,
    account: r.acct,
    date: r.date,
    amount: r.amount,
    category: r.category,
    payee: r.description,
    notes: r.notes,
    parent_id: r.parent_id ?? null,
    transfer_id: r.transferred_id,
    cleared: r.cleared === 1,
    reconciled: r.reconciled === 1,
    sort_order: r.sort_order,
    starting_balance_flag: r.starting_balance_flag === 1,
    schedule: r.schedule ?? null,
    tombstone: r.tombstone === 1,
    financialId: r.financial_id ?? null,
    importedDescription: r.imported_description ?? null,
    payeeName: r.payee_name,
    categoryName: r.category_name,
    accountName: r.account_name,
    splitCategoryNames: r.split_category_names,
    splitCategoryAmounts: r.split_category_amounts,
  };
}

// ---------------------------------------------------------------------------
// TransactionQueryBuilder
// ---------------------------------------------------------------------------

type Filter = { sql: string; params: (string | number)[] };

export class TransactionQueryBuilder {
  private _filters: Filter[] = [];
  private _extraJoins: string[] = [];
  private _includeAccountName = false;
  private _includeSplits = false;
  private _limit?: number;
  private _offset?: number;
  private _orderBy = "t.date DESC, t.sort_order DESC";

  // -- Filter methods (chainable) ------------------------------------------

  /** Add a raw WHERE clause with params. */
  filter(sql: string, params: (string | number)[] = []): this {
    this._filters.push({ sql, params });
    return this;
  }

  /** Standard "alive" filter: not tombstoned, not a child row. */
  alive(): this {
    return this.filter("t.tombstone = 0 AND t.isChild = 0");
  }

  /** Filter by account. */
  forAccount(accountId: string): this {
    return this.filter("t.acct = ?", [accountId]);
  }

  /** Exclude reconciled transactions. */
  hideReconciled(): this {
    return this.filter("t.reconciled = 0");
  }

  /** Filter by category (including parent splits that have a matching child). */
  withCategory(categoryId: string): this {
    return this.filter(
      "(t.category = ? OR (t.isParent = 1 AND EXISTS (SELECT 1 FROM transactions ch WHERE ch.parent_id = t.id AND ch.tombstone = 0 AND ch.category = ?)))",
      [categoryId, categoryId],
    );
  }

  /** Filter by payee (resolved through payee_mapping). */
  withPayee(payeeId: string): this {
    return this.filter("COALESCE(pm.targetId, t.description) = ?", [payeeId]);
  }

  /** Uncategorized transactions on on-budget accounts (excludes on-budget transfers). */
  uncategorized(): this {
    this._filters.push({ sql: "(t.category IS NULL AND t.isParent = 0)", params: [] });
    this._filters.push({ sql: "(p.transfer_acct IS NULL OR tr_acc.offbudget = 1)", params: [] });
    return this;
  }

  /** Filter by cleared/uncleared/reconciled/unreconciled status (OR'd together). */
  withStatus(opts: {
    cleared?: boolean;
    uncleared?: boolean;
    reconciled?: boolean;
    unreconciled?: boolean;
  }): this {
    const clauses: string[] = [];
    if (opts.cleared) clauses.push("(t.cleared = 1 AND t.reconciled = 0)");
    if (opts.uncleared) clauses.push("(t.cleared = 0)");
    if (opts.reconciled) clauses.push("(t.reconciled = 1)");
    if (opts.unreconciled) clauses.push("(t.reconciled = 0)");
    if (clauses.length > 0) {
      this._filters.push({ sql: `(${clauses.join(" OR ")})`, params: [] });
    }
    return this;
  }

  /** Filter by a single tag in notes. */
  withTag(tagName: string): this {
    return this.filter("t.notes LIKE ?", [`%#${tagName}%`]);
  }

  /** Filter by multiple tags in notes (AND). */
  withTags(tagNames: string[]): this {
    for (const tag of tagNames) {
      this.filter("t.notes LIKE ?", [`%#${tag}%`]);
    }
    return this;
  }

  /** Free-text search across payee, category, notes, and account name. */
  textSearch(text: string): this {
    const pattern = `%${text}%`;
    return this.filter(
      "(COALESCE(tr_acc.name, p.name) LIKE ? OR c.name LIKE ? OR t.notes LIKE ? OR acc.name LIKE ?)",
      [pattern, pattern, pattern, pattern],
    );
  }

  /** Conditionally apply a modifier. */
  when(condition: boolean | undefined, fn: (q: this) => this): this {
    if (condition) fn(this);
    return this;
  }

  // -- Select modifiers ----------------------------------------------------

  /** Include acc.name AS account_name (adds JOIN accounts acc). */
  includeAccountName(): this {
    this._includeAccountName = true;
    return this;
  }

  /** Include split_category_names and split_category_amounts subqueries. */
  includeSplitDetails(): this {
    this._includeSplits = true;
    return this;
  }

  // -- Pagination / ordering -----------------------------------------------

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  offset(n: number): this {
    this._offset = n;
    return this;
  }

  orderBy(sql: string): this {
    this._orderBy = sql;
    return this;
  }

  // -- Build & execute -----------------------------------------------------

  build(): { sql: string; params: (string | number)[] } {
    // SELECT
    let select = DISPLAY_SELECT;
    if (this._includeAccountName) select += ",\n    acc.name AS account_name";
    if (this._includeSplits) select += SPLIT_SELECT;

    // FROM + JOINs
    let from = "FROM transactions t";
    if (this._includeAccountName) {
      from += "\n  JOIN accounts acc ON acc.id = t.acct AND acc.tombstone = 0";
    }
    from += DISPLAY_JOINS;
    for (const j of this._extraJoins) from += `\n  ${j}`;

    // WHERE
    const allParams: (string | number)[] = [];
    const whereClauses = this._filters.map((f) => {
      allParams.push(...f.params);
      return f.sql;
    });
    const where = whereClauses.length > 0 ? whereClauses.join(" AND ") : "1";

    // ORDER BY + pagination
    let tail = `ORDER BY ${this._orderBy}`;
    if (this._limit !== undefined) tail += ` LIMIT ${this._limit}`;
    if (this._offset !== undefined) tail += ` OFFSET ${this._offset}`;

    const sql = `SELECT ${select}\n  ${from}\n  WHERE ${where}\n  ${tail}`;
    return { sql, params: allParams };
  }

  async execute(): Promise<TransactionDisplay[]> {
    const { sql, params } = this.build();
    const rows = await runQuery<RawDisplayRow>(sql, params);
    return rows.map(rowToDisplay);
  }
}

/** Create a new transaction query builder. */
export function transactionQuery(): TransactionQueryBuilder {
  return new TransactionQueryBuilder();
}
