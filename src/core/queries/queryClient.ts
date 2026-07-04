import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { reportError } from "@/core/errors/report";

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      reportError(error, { inlineHandled: mutation.meta?.inline === true }),
  }),
  queryCache: new QueryCache({
    onError: (error) => reportError(error, { context: { source: "query" } }),
  }),
});
