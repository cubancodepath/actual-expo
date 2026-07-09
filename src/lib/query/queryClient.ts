import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      emitErrorEvent(error, {
        operation: "mutation",
        inline: mutation.meta?.inline === true,
      });
    },
  }),
  queryCache: new QueryCache({
    onError: (error) => {
      emitErrorEvent(error, { operation: "query" });
    },
  }),
});
