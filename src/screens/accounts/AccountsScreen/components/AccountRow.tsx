import { memo } from "react";
import { View } from "react-native";
import { ListGroup, useThemeColor } from "heroui-native";
import { Banknote, ChartSpline, ChevronRight } from "lucide-react-native";
import type { Account } from "@/core/types/models";
import { Money } from "@/ui/Money";
import { useAccountBalance } from "@/lib/hooks/useAccounts";
import { LiftMenu, type RowRect } from "@/ui/lift-menu";

/**
 * The visual content of an account row — icon · name · balance · chevron.
 * Shared by the live (pressable) row and the floating "lift" preview the menu
 * renders over it, so the two match pixel-for-pixel.
 */
export function AccountRowContent({ account }: { account: Account }) {
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const balance = useAccountBalance(account.id);

  return (
    <ListGroup.Item disabled>
      <ListGroup.ItemPrefix>
        <View className="size-9 items-center justify-center rounded-full bg-background">
          {account.offbudget ? (
            <ChartSpline size={18} color={foreground} />
          ) : (
            <Banknote size={18} color={foreground} />
          )}
        </View>
      </ListGroup.ItemPrefix>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{account.name}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <View className="flex-row items-center gap-2">
          <Money cents={balance} className="text-sm" />
          <ChevronRight size={18} color={muted} />
        </View>
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

interface AccountRowProps {
  account: Account;
  onPress: (account: Account) => void;
  /** Open the row's context menu; `rect` is its measured window frame. */
  onLongPress: (account: Account, rect: RowRect) => void;
  /** Menu open on this row with its preview up — the live row hides itself. */
  isLifted?: boolean;
}

/**
 * A tappable account row (a `ListGroup.Item` wrapped in `LiftMenu.Row`, which
 * provides the press feedback and long-press lift wiring). Tap navigates to
 * the account; long-press hands the row's frame to the screen's
 * `LiftMenu.Host`, which anchors the menu and floats a preview over the
 * (hidden) row.
 */
export const AccountRow = memo(function AccountRow({
  account,
  onPress,
  onLongPress,
  isLifted = false,
}: AccountRowProps) {
  return (
    <LiftMenu.Row
      onPress={() => onPress(account)}
      onLongPress={(rect) => onLongPress(account, rect)}
      isLifted={isLifted}
    >
      <AccountRowContent account={account} />
    </LiftMenu.Row>
  );
});
