import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ActualError } from "@/core/errors";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";

// A dropped/expired token surfaces as ActualError("auth/token-expired") from the
// transport layer — core stays store-free and never logs out itself (mirroring
// upstream, where the server layer only throws and the client signs out). Do the
// signOut here, centrally, for every react-query mutation/query; the root auth
// guard then routes to the login screen. Dynamic import avoids a module-init
// cycle (authService → stores) at queryClient construction time.
function logoutIfTokenExpired(error: unknown): void {
  if (error instanceof ActualError && error.code === "auth/token-expired") {
    void import("@/stores/sessionStore").then(({ useSessionStore }) =>
      useSessionStore.getState().signOut(),
    );
  }
}

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      logoutIfTokenExpired(error);
      emitErrorEvent(error, {
        operation: "mutation",
        inline: mutation.meta?.inline === true,
      });
    },
  }),
  queryCache: new QueryCache({
    onError: (error) => {
      logoutIfTokenExpired(error);
      emitErrorEvent(error, { operation: "query" });
    },
  }),
});
