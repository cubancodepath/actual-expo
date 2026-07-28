import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Separator, Typography, useThemeColor } from "heroui-native";
import { ChevronLeft } from "lucide-react-native";
import type { Account } from "@/core/types/models";
import { SearchButton } from "./SearchButton";
import { AccountDetailMenu } from "./AccountDetailMenu";
import { AccountSummary } from "./AccountSummary";
import { useSurfaceLevel } from "@/ui/surface-level";

interface AccountDetailHeaderProps {
  accountId: string;
  account: Account | undefined;
  title: string;
  /** Cleared balance (cents) forwarded to the reconcile action. */
  clearedBalance: number;
  /** Whether reconciled transactions are shown (drives the menu toggle). */
  showReconciled: boolean;
  setShowReconciled: (val: boolean) => void;
  onSearch: () => void;
}

/**
 * Dedicated solid header for the account-detail screen (like BudgetHeader for
 * the budget tab — self-contained, no shared ScreenHeader scaffold). Back +
 * account name + search + overflow menu, with the balance summary pinned below.
 * Rendered as the shell's `stickyHeader`, so it never scrolls.
 */
export function AccountDetailHeader({
  accountId,
  account,
  title,
  clearedBalance,
  showReconciled,
  setShowReconciled,
  onSearch,
}: AccountDetailHeaderProps) {
  const { canvas } = useSurfaceLevel();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");

  return (
    <View className={canvas}>
      <View className="px-4 pb-3" style={{ paddingTop: insets.top + 4 }}>
        <View className="flex-row items-center gap-2">
          <Button
            variant="secondary"
            isIconOnly
            className="rounded-full"
            onPress={() => router.back()}
          >
            <ChevronLeft size={24} color={foreground} />
          </Button>
          <Typography className="flex-1 text-lg font-semibold text-foreground" numberOfLines={1}>
            {title}
          </Typography>
          <View className="flex-row items-center gap-1">
            <SearchButton onPress={onSearch} />
            <AccountDetailMenu
              account={account}
              clearedBalance={clearedBalance}
              showReconciled={showReconciled}
              setShowReconciled={setShowReconciled}
            />
          </View>
        </View>

        <View className="mt-3">
          <AccountSummary accountId={accountId} />
        </View>
      </View>

      <Separator />
    </View>
  );
}
