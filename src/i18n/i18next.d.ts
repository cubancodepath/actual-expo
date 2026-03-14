import 'i18next';

import type common from '../locales/en/common.json';
import type auth from '../locales/en/auth.json';
import type onboarding from '../locales/en/onboarding.json';
import type settings from '../locales/en/settings.json';
import type transactions from '../locales/en/transactions.json';
import type accounts from '../locales/en/accounts.json';
import type schedules from '../locales/en/schedules.json';
import type budget from '../locales/en/budget.json';
import type setup from '../locales/en/setup.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      auth: typeof auth;
      onboarding: typeof onboarding;
      settings: typeof settings;
      transactions: typeof transactions;
      accounts: typeof accounts;
      schedules: typeof schedules;
      budget: typeof budget;
      setup: typeof setup;
    };
  }
}
