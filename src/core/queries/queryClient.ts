import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { emitErrorEvent } from "@/core/errors/ErrorChannel";
import { reportError } from "@/core/errors/report";

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      emitErrorEvent(error, {
        source: "UNKNOWN",
        context: { operation: "mutation", inline: mutation.meta?.inline === true },
      });
      reportError(error, { inlineHandled: mutation.meta?.inline === true });
    },
  }),
  queryCache: new QueryCache({
    onError: (error) => {
      emitErrorEvent(error, { source: "UNKNOWN", context: { operation: "query" } });
      reportError(error, { context: { source: "query" } });
    },
  }),
});
