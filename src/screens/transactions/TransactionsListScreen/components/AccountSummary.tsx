import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Typography } from "heroui-native";
import { Money } from "@/ui/Money";
import { useAccountBalances } from "@/lib/hooks/useAccounts";

/**
 * Account-detail balance summary: the working balance as a hero on the left,
 * flanked by Cleared / Uncleared on the right. The right column is hidden when
 * there's nothing uncleared (mobile-upstream behaviour). Padding is owned by the
 * header that embeds it.
 */
export function AccountSummary({ accountId }: { accountId: string }) {
  const { t } = useTranslation("accounts");
  const { balance, cleared, uncleared } = useAccountBalances(accountId);

  return (
    <View className="flex-row items-start justify-between">
      <View>
        <Typography className="text-xs text-muted">{t("detail.workingBalance")}</Typography>
        <Money cents={balance} tone="plain" className="text-sm" />
      </View>

      {uncleared !== 0 ? (
        <View className="gap-1">
          <View className="flex-row items-center justify-between gap-6">
            <Typography className="text-xs text-muted">{t("detail.clearedLabel")}</Typography>
            <Money cents={cleared} tone="plain" className="text-sm" />
          </View>
          <View className="flex-row items-center justify-between gap-6">
            <Typography className="text-xs text-muted">{t("detail.unclearedLabel")}</Typography>
            <Money cents={uncleared} tone="plain" className="text-sm" />
          </View>
        </View>
      ) : null}
    </View>
  );
}
