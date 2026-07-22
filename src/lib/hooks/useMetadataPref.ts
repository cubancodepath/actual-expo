/**
 * useMetadataPref — read/write a budget metadata preference by its upstream
 * name. Faithful to `desktop-client/src/hooks/useMetadataPref` in API; on mobile
 * the metadata lives in `budgetContextStore` (data/sync-layer infra), so this is
 * a thin adapter mapping upstream MetadataPrefs names onto that store's fields.
 *
 * Only the fields the mobile store actually holds are supported. Upstream keys
 * without a mobile home (`lastUploaded`, `resetClock`, `lastScheduleRun`) are
 * intentionally not part of the accepted key set.
 *
 * @example
 * const [cloudFileId] = useMetadataPref("cloudFileId"); // = budgetContext.fileId
 */
import { useCallback } from "react";
import { useBudgetContextStore } from "@/stores/budgetContextStore";

// upstream MetadataPrefs key → budgetContextStore field name.
const FIELD = {
  id: "activeBudgetId",
  cloudFileId: "fileId",
  groupId: "groupId",
  encryptKeyId: "encryptKeyId",
  lastSyncedTimestamp: "lastSyncedTimestamp",
  budgetName: "budgetName",
} as const;

type MetadataPrefKey = keyof typeof FIELD;

export function useMetadataPref<K extends MetadataPrefKey>(
  key: K,
): [string | undefined, (value: string) => void] {
  const field = FIELD[key];
  const value = useBudgetContextStore((s) => s[field] as string | undefined);

  const set = useCallback(
    (next: string) => {
      useBudgetContextStore.getState().setBudgetContext({ [field]: next });
    },
    [field],
  );

  return [value, set];
}
