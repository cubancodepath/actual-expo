// Auth policy — the single owner of the expired-token reaction.
//
// Every layer already reports an expired session to the error bus as
// ActualError("auth/token-expired") (the sync path, react-query, file listing,
// …). This is the one place that turns that report into an action: a full
// signOut. Registered once via installAppServices; nothing else should call
// signOut on a 401.
//
// Contract note: this makes the ErrorChannel more than a report-only bus — it
// is the bus's first POLICY subscriber (kept deliberately separate and named,
// distinct from ErrorChannelConsumer's log+Sentry reporting).
import { errorChannel } from "@/lib/errors/ErrorChannel";
import { signOut } from "@/stores/operations/users";

let signingOut = false;

/** Subscribe the 401 → signOut policy. Returns the unsubscribe function. */
export function installAuthPolicy(): () => void {
  return errorChannel.subscribe((event) => {
    if (event.code !== "auth/token-expired") return;
    // Several 401s can land at once (a sync + a query racing) — only one
    // teardown. The flag drops when signOut settles so a later, genuine
    // re-expiry after signing back in still triggers.
    if (signingOut) return;
    signingOut = true;
    void signOut().finally(() => {
      signingOut = false;
    });
  });
}
