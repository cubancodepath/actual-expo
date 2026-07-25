import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";

// Every react-query failure is reported to the error bus. That's ALL this
// module does with errors — it holds no auth knowledge. A dropped/expired
// token surfaces as ActualError("auth/token-expired"); the single owner of the
// signOut reaction is src/lib/errors/authPolicy.ts, which subscribes to the
// bus. This keeps the queryClient singleton (constructed at import time) free
// of any store import.
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
