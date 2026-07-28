import { useState } from "react";
import { ListGroup, Separator, Spinner, Typography, useThemeColor } from "heroui-native";
import { useTranslation } from "react-i18next";
import { resetBudgetCache } from "@/core/server/budgetfiles/app";
import { resetSync } from "@/core/server/sync/reset";
import { fixSplitTransactions } from "@/core/tools/fixSplitTransactions";
// Aliased: `busy` is already this component's in-row loading state.
import { busy as busyOverlay } from "@/ui/feedback/busy";
import { dialog } from "@/ui/feedback/dialog/dialogStore";
import { useMetadataPref } from "@/lib/hooks/useMetadataPref";
import { useSessionStore } from "@/stores/sessionStore";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { useSurfaceLevel } from "@/ui/surface-level";

type Busy = null | "cache" | "sync" | "repair";

/**
 * An action row styled like a button (accent title). Shows a trailing spinner
 * while it runs (Apple-style, in-row); rows are inert while any action runs.
 * `unavailable` (e.g. Reset sync without syncing) reads muted and can't be tapped.
 */
function ActionRow({
  title,
  onPress,
  loading,
  anyBusy,
  unavailable,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  anyBusy?: boolean;
  unavailable?: boolean;
}) {
  const accent = useThemeColor("accent");
  const muted = useThemeColor("muted");
  const disabled = unavailable || anyBusy;

  return (
    <ListGroup.Item disabled={disabled} onPress={disabled ? undefined : onPress}>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle style={{ color: unavailable ? muted : accent }}>
          {title}
        </ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      {loading && (
        <ListGroup.ItemSuffix>
          <Spinner size="sm" color={accent} />
        </ListGroup.ItemSuffix>
      )}
    </ListGroup.Item>
  );
}

/**
 * Advanced group — Reset budget cache, Reset sync, Repair transactions
 * (upstream's `<AdvancedToggle>` actions). Fast actions show an in-row spinner;
 * Reset sync confirms first and blocks the screen (it re-uploads and forces
 * other devices to re-download).
 */
export function AdvancedGroup() {
  const { itemVariant } = useSurfaceLevel();
  const { t } = useTranslation("settings");
  const [busy, setBusy] = useState<Busy>(null);

  const [groupId] = useMetadataPref("groupId");
  const canResetSync = !!groupId;

  async function run(key: Busy, action: () => Promise<void>) {
    setBusy(key);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  }

  const handleResetCache = () => run("cache", () => resetBudgetCache());

  async function handleResetSync() {
    const ok = await dialog.confirm({
      title: t("resetSyncConfirmTitle"),
      message: t("resetSyncConfirmMessage"),
      confirmLabel: t("resetSync"),
      destructive: true,
    });
    if (!ok) return;

    const { serverUrl, token } = useSessionStore.getState();
    const { fileId, activeBudgetId } = useBudgetContextStore.getState();
    await run("sync", async () => {
      // Only this action blocks the screen (slow + affects other devices), so
      // it runs behind the root overlay, which reaches over the settings modal.
      const result = await busyOverlay.run(() =>
        resetSync({ serverUrl, token, cloudFileId: fileId, budgetId: activeBudgetId }),
      );
      if ("error" in result) {
        await dialog.alert({ title: t("resetSync"), message: t("resetSyncFailed") });
      } else if (result.groupId) {
        useBudgetContextStore.getState().setBudgetContext({ groupId: result.groupId });
      }
    });
  }

  async function handleRepair() {
    let res: Awaited<ReturnType<typeof fixSplitTransactions>> | undefined;
    await run("repair", async () => {
      res = await fixSplitTransactions();
    });
    if (!res) return;

    const fixed =
      res.numBlankPayees +
      res.numCleared +
      res.numDeleted +
      res.numTransfersFixed +
      res.numNonParentErrorsFixed +
      res.numParentTransactionsWithCategoryFixed;

    let message: string;
    if (fixed === 0 && res.mismatchedSplits.length === 0) {
      message = t("repairNoneFound");
    } else {
      message = t("repairSummary", { count: fixed });
      if (res.mismatchedSplits.length > 0) {
        message += ` ${t("repairMismatched", { count: res.mismatchedSplits.length })}`;
      }
    }
    await dialog.alert({ title: t("repairTransactions"), message });
  }

  const anyBusy = busy !== null;

  return (
    <>
      <ListGroup variant={itemVariant}>
        <ActionRow
          title={t("resetBudgetCache")}
          onPress={handleResetCache}
          loading={busy === "cache"}
          anyBusy={anyBusy}
        />
        <Separator className="mx-4" />
        <ActionRow
          title={t("resetSync")}
          onPress={handleResetSync}
          anyBusy={anyBusy}
          unavailable={!canResetSync}
        />
        <Separator className="mx-4" />
        <ActionRow
          title={t("repairTransactions")}
          onPress={handleRepair}
          loading={busy === "repair"}
          anyBusy={anyBusy}
        />
      </ListGroup>

      {!canResetSync && (
        <Typography className="mt-3 ml-2 text-sm text-muted">{t("resetSyncDisabled")}</Typography>
      )}
    </>
  );
}
