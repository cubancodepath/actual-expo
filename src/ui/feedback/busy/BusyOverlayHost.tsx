import { LoadingOverlay } from "@/ui/LoadingOverlay";
import { useBusyStore } from "./busyStore";

/**
 * Sole subscriber of the busy store. Mounted ONCE at the app root as a sibling
 * above the navigator (`asModal={false}`), so it composes with native modals
 * and survives screens unmounting mid-operation (e.g. the file picker during a
 * budget switch). The spinner is Reanimated-driven (UI thread), so it keeps
 * animating even while the JS thread is blocked in synchronous core work.
 */
export function BusyOverlayHost() {
  const count = useBusyStore((s) => s.count);
  const message = useBusyStore((s) => s.message);
  const progress = useBusyStore((s) => s.progress);

  return (
    <LoadingOverlay
      asModal={false}
      visible={count > 0}
      message={message ?? undefined}
      progressText={progress ? `${progress.done}/${progress.total}` : undefined}
    />
  );
}
