import common from "./common.json";
import auth from "./auth.json";
import onboarding from "./onboarding.json";
import settings from "./settings.json";
import transactions from "./transactions.json";
import accounts from "./accounts.json";
import schedules from "./schedules.json";
import budget from "./budget.json";
import setup from "./setup.json";
import errors from "./errors.json";
import bankSync from "./bankSync.json";

export default {
  common,
  auth,
  onboarding,
  settings,
  transactions,
  accounts,
  schedules,
  budget,
  setup,
  errors,
  bankSync,
} as const;
