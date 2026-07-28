import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Button, Typography, useThemeColor } from "heroui-native";
import { Check, X } from "lucide-react-native";
import { lockTransactions, reconcileAccount } from "@/core/server/transactions";
import { AmountKeyboard } from "@/ui/amount-keyboard";
import { AmountField } from "@/ui/money-entry/AmountField";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { successHaptic } from "@/ui/haptics";

/** Human-readable "x ago (Mon d)" for the last-reconciled timestamp param. */
function formatLastReconciled(raw: string | undefined): string | null {
  if (!raw) return null;
  const ts = Number(raw);
  const date = isNaN(ts) ? new Date(raw) : new Date(ts);
  if (isNaN(date.getTime())) return null;
  return `${formatDistanceToNowStrict(date, { addSuffix: true })} (${format(date, "MMM d")})`;
}

/**
 * Reconcile an account against its bank balance — a full modal shaped like
 * HoldScreen (our header + the in-app amount pad). The sign selector rides
 * inside the amount field; the pad value stays unsigned and the sign is applied
 * at submit. Confirming with diff 0 just locks; otherwise it creates the
 * adjustment and locks.
 */
export function ReconcileScreen() {
  const { t } = useTranslation("accounts");
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const accentForeground = useThemeColor("accent-foreground");
  const { accountId, clearedBalance, lastReconciled } = useLocalSearchParams<{
    accountId: string;
    clearedBalance: string;
    lastReconciled: string;
  }>();

  const clearedCents = Number(clearedBalance) || 0;
  const lastReconciledText = formatLastReconciled(lastReconciled);

  const [cents, setCents] = useState(Math.abs(clearedCents));
  const [isNegative, setIsNegative] = useState(clearedCents < 0);
  const [amountOpen, setAmountOpen] = useState(true);
  const [saving, setSaving] = useState(false);

  const bankBalance = isNegative ? -cents : cents;
  const diff = bankBalance - clearedCents;

  async function handleReconcile() {
    if (cents === 0 || saving) return;
    setSaving(true);
    try {
      if (diff === 0) {
        await lockTransactions(accountId);
      } else {
        await reconcileAccount(accountId, bankBalance);
      }
      successHaptic();
      router.dismiss();
    } finally {
      setSaving(false);
    }
  }

  const caption =
    cents > 0
      ? diff === 0
        ? t("reconcile.diffZero")
        : t("reconcile.adjustmentNotice")
      : lastReconciledText
        ? t("reconcile.lastReconciled", { date: lastReconciledText })
        : null;

  return (
    <AmountKeyboard
      isOpen={amountOpen}
      onOpenChange={setAmountOpen}
      value={cents}
      onValueChange={setCents}
    >
      <View className="flex-1">
        <ScreenHeader>
          <ScreenHeader.Back>
            <Button
              variant="secondary"
              isIconOnly
              className="rounded-full"
              onPress={() => router.dismiss()}
            >
              <X size={24} color={foreground} />
            </Button>
          </ScreenHeader.Back>
          <ScreenHeader.Title>{t("reconcile.title")}</ScreenHeader.Title>
          <ScreenHeader.Actions>
            <Button
              isIconOnly
              className="rounded-full"
              isDisabled={cents === 0 || saving}
              onPress={handleReconcile}
            >
              <Check size={22} color={accentForeground} />
            </Button>
          </ScreenHeader.Actions>
        </ScreenHeader>

        <AmountKeyboard.DismissArea className="flex-1">
          <View className="gap-1 px-4">
            <Typography className="mb-1 text-sm text-muted">
              {t("reconcile.bankBalanceQuestion")}
            </Typography>
            <AmountField>
              <AmountField.Sign isNegative={isNegative} onToggle={() => setIsNegative((v) => !v)} />
            </AmountField>
            {caption ? (
              <Typography className="ml-1 mt-1 text-xs text-muted">{caption}</Typography>
            ) : null}
          </View>
        </AmountKeyboard.DismissArea>
      </View>

      <AmountKeyboard.Portal>
        <AmountKeyboard.Panel />
      </AmountKeyboard.Portal>
    </AmountKeyboard>
  );
}
