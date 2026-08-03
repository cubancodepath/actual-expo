import { useCallback, useState } from "react";
import { RefreshControl } from "react-native";
import { useThemeColor } from "heroui-native";
import { useSyncStore } from "@/stores/syncStore";

/**
 * Pull-to-refresh = manual sync. Returns a ready element for a scroll view's
 * `refreshControl` prop:
 *
 *   <ScrollView refreshControl={useSyncRefreshControl()} />
 *
 * Pass `progressViewOffset` where a translucent header floats over the content:
 * the spinner is positioned from the scroll view's own top, which sits behind
 * the bar, so without it the spinner appears underneath the header.
 *
 * The spinner tracks only THIS gesture's sync (local state — no cross-screen
 * spinner leak). Errors surface through the sync-event policy listener
 * (src/lib/sync-events.ts) like every other sync path, so a failed or offline
 * pull ends silently — the local-first contract.
 */
export function useSyncRefreshControl(progressViewOffset?: number) {
  const [refreshing, setRefreshing] = useState(false);
  const accent = useThemeColor("accent");
  const sync = useSyncStore((s) => s.sync); // action ref is stable

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await sync(); // never rejects
    } finally {
      setRefreshing(false);
    }
  }, [sync]);

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={accent}
      colors={[accent]}
      progressViewOffset={progressViewOffset}
    />
  );
}
