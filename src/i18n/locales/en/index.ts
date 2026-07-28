import common from "./common.json";
import auth from "./auth.json";
import settings from "./settings.json";
import transactions from "./transactions.json";
import accounts from "./accounts.json";
import schedules from "./schedules.json";
import budget from "./budget.json";
import setup from "./setup.json";
import errors from "./errors.json";
import reports from "./reports.json";

export default {
  common,
  auth,
  settings,
  transactions,
  accounts,
  schedules,
  budget,
  setup,
  errors,
  reports,
} as const;
