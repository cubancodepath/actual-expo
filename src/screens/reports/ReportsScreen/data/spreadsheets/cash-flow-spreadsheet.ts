/**
 * Cash flow spreadsheet — port of desktop-client
 * `spreadsheets/cash-flow-spreadsheet.tsx` `simpleCashFlow` (the card view: two
 * totals, income and expense). Mechanical substitutions vs upstream:
 *  - `send('make-filters-from-conditions')` → `makeReportFilters`
 *  - `runAll(...)` → `Promise.all` of `aqlQuery`
 *  - `monthUtils` → `@/core/shared/monthUtils`; dates stay strings
 *
 * The full `cashFlowByDate` (the detail-screen series) is intentionally NOT
 * ported yet — the card only needs `simpleCashFlow`.
 */
import { q } from "@/core/queries";
import { aqlQuery } from "@/core/server/aql";
import * as monthUtils from "@/core/shared/monthUtils";
import type { RuleCondition } from "@/core/types/models";
import { makeReportFilters } from "../makeFilters";

export type CashFlowData = {
  graphData: { income: number; expense: number };
};

export function simpleCashFlow(
  startMonth: string,
  endMonth: string,
  conditions: RuleCondition[] = [],
  conditionsOp: "and" | "or" = "and",
) {
  const start = monthUtils.firstDayOfMonth(startMonth);
  const end = monthUtils.lastDayOfMonth(endMonth);

  return async (setData: (data: CashFlowData) => void) => {
    const { filters, conditionsOpKey } = makeReportFilters(conditions, conditionsOp);

    function makeQuery() {
      return q("transactions")
        .filter({ [conditionsOpKey]: filters })
        .filter({
          $and: [
            { date: { $gte: start } },
            {
              date: {
                $lte: end > monthUtils.currentDay() ? monthUtils.currentDay() : end,
              },
            },
          ],
          "account.offbudget": false,
          "payee.transfer_acct": null,
        })
        .calculate({ $sum: "$amount" });
    }

    const [income, expense] = await Promise.all([
      aqlQuery<number>(makeQuery().filter({ amount: { $gt: 0 } })).then(({ data }) => data ?? 0),
      aqlQuery<number>(makeQuery().filter({ amount: { $lt: 0 } })).then(({ data }) => data ?? 0),
    ]);

    setData({ graphData: { income, expense } });
  };
}
