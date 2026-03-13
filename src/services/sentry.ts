import * as Sentry from '@sentry/react-native';

// Replace with your actual Sentry DSN from https://sentry.io
const SENTRY_DSN = '__SENTRY_DSN__';

export function initSentry() {
  if (SENTRY_DSN === '__SENTRY_DSN__') {
    if (__DEV__) console.warn('[Sentry] DSN not configured — skipping init');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !__DEV__,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    // Do not capture financial data in breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console') return null;
      return breadcrumb;
    },
  });
}

export { Sentry };
