/**
 * Zod validation for the transaction form.
 *
 * Only *hard* validation lives here (amount > 0, account required). The messages
 * are i18n keys under the `transactions` namespace — the UI runs them through
 * `t(...)`. Soft rules (reconciled confirm, missing-category confirm) are handled
 * imperatively in the submit handler, not here.
 */

import { z } from "zod";
import type { RecurConfig } from "@/core/types/models";
import type { SplitLineForm } from "@/ui/entity-select/types";

export type TransactionType = "expense" | "income";

/** The full shape of the transaction form values (drives TanStack Form typing). */
export type TransactionFormValues = {
  type: TransactionType;
  amount: number; // positive cents; sign is derived from `type` at save time
  accountId: string | null;
  accountName: string;
  payeeId: string | null;
  payeeName: string;
  isTransfer: boolean;
  categoryId: string | null;
  categoryName: string;
  date: number; // YYYYMMDD
  notes: string;
  cleared: boolean;
  reconciled: boolean;
  recurConfig: RecurConfig | null;
  splitLines: SplitLineForm[] | null;
};

/**
 * Standard-Schema validator (zod v4 is Standard Schema native — no adapter needed).
 * Base object validates types; `superRefine` adds the hard, field-anchored rules
 * with i18n-key messages so TanStack Form maps them to the right field.
 */
export const transactionFormSchema = z
  .object({
    type: z.enum(["expense", "income"]),
    amount: z.number(),
    accountId: z.string().nullable(),
    accountName: z.string(),
    payeeId: z.string().nullable(),
    payeeName: z.string(),
    isTransfer: z.boolean(),
    categoryId: z.string().nullable(),
    categoryName: z.string(),
    date: z.number(),
    notes: z.string(),
    cleared: z.boolean(),
    reconciled: z.boolean(),
    recurConfig: z.any(),
    splitLines: z.any(),
  })
  .superRefine((val, ctx) => {
    if (!Number.isFinite(val.amount) || val.amount <= 0) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "enterAmount" });
    }
    if (!val.accountId) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: "selectAccount" });
    }
    // Split integrity: when there is more than one line, the lines must sum to the total.
    const lines = val.splitLines as SplitLineForm[] | null;
    if (lines && lines.length > 1) {
      const sum = lines.reduce((acc, l) => acc + (l.amount || 0), 0);
      if (sum !== val.amount) {
        ctx.addIssue({ code: "custom", path: ["splitLines"], message: "amountsDontMatch" });
      }
    }
  });

/** True when the given lines represent a real split (more than one line). */
export function isSplitLines(lines: SplitLineForm[] | null): boolean {
  return lines !== null && lines.length > 1;
}
