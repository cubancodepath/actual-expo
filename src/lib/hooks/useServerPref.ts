/**
 * useServerPref — read/write a sync-server preference.
 *
 * Kept for API parity with upstream `desktop-client/src/hooks/useServerPref`.
 * ServerPrefs (only `flags.plugins`) are a desktop/web concern with no consumer
 * on mobile, so this is a stub: reads return `undefined`, writes are no-ops.
 */
import type { ServerPrefs } from "@/core/types/prefs";

export function useServerPref<K extends keyof ServerPrefs>(
  _key: K,
): [ServerPrefs[K] | undefined, (value: ServerPrefs[K]) => void] {
  return [undefined, () => {}];
}
