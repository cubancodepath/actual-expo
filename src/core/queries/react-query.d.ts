import "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /**
       * Set on a `useMutation` call whose screen renders `<InlineError/>` for
       * `mutation.error` itself — the global MutationCache onError still logs
       * the failure to the error bus (emitErrorEvent); the flag marks it as
       * locally displayed for future consumers.
       */
      inline?: boolean;
    };
  }
}
