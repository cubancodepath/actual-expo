/**
 * makeQuery — port of desktop-client `reports/spreadsheets/makeQuery.ts`. Builds
 * the transactions query the spending (and other) spreadsheets run for "assets"
 * (amount > 0) and "debts" (amount < 0), grouped by interval + account + payee +
 * category, with the category/account/payee metadata each row needs.
 */
import { q } from "@/lib/queries";
import type { ObjectExpression } from "@/core/shared/query";
import { ReportOptions } from "./ReportOptions";

export function makeQuery(
  name: "assets" | "debts",
  startDate: string,
  endDate: string,
  interval: string,
  conditionsOpKey: "$and" | "$or",
  filters: ObjectExpression[],
) {
  const intervalGroup =
    interval === "Monthly"
      ? { $month: "$date" }
      : interval === "Yearly"
        ? { $year: "$date" }
        : { $day: "$date" };
  const intervalFilter =
    interval === "Weekly"
      ? "$day"
      : "$" + (ReportOptions.intervalMap.get(interval)?.toLowerCase() || "month");

  const query = q("transactions")
    // Apply filters and split by "Group By"
    .filter({ [conditionsOpKey]: filters })
    // Apply the interval range filters
    .filter({
      $and: [
        { date: { $transform: intervalFilter, $gte: startDate } },
        { date: { $transform: intervalFilter, $lte: endDate } },
      ],
    })
    // Show assets or debts
    .filter(name === "assets" ? { amount: { $gt: 0 } } : { amount: { $lt: 0 } });

  return query
    .groupBy([
      intervalGroup,
      { $id: "$account" },
      { $id: "$payee" },
      { $id: "$category" },
      { $id: "$payee.transfer_acct.id" },
    ])
    .select([
      { date: intervalGroup },
      { category: { $id: "$category.id" } },
      { categoryHidden: { $id: "$category.hidden" } },
      { categoryIncome: { $id: "$category.is_income" } },
      { categoryGroup: { $id: "$category.group.id" } },
      { categoryGroupHidden: { $id: "$category.group.hidden" } },
      { account: { $id: "$account.id" } },
      { accountOffBudget: { $id: "$account.offbudget" } },
      { payee: { $id: "$payee.id" } },
      { transferAccount: { $id: "$payee.transfer_acct.id" } },
      { amount: { $sum: "$amount" } },
    ]);
}
