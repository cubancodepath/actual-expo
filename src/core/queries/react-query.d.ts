import "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /**
       * Set on a `useMutation` call whose screen renders `<InlineError/>` for
       * `mutation.error` itself — the global MutationCache onError still
       * reports to Sentry/breadcrumbs via reportError, it just skips queuing
       * a toast/dialog so the error isn't shown twice.
       */
      inline?: boolean;
    };
  }
}
