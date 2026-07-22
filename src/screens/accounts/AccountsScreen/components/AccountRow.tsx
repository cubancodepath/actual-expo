import { memo, useRef } from "react";
import { View } from "react-native";
import { cn, ListGroup, PressableFeedback, useThemeColor } from "heroui-native";
import { Banknote, ChartSpline, ChevronRight } from "lucide-react-native";
import type { Account } from "@/core/domain/accounts/types";
import { Money } from "@/ui/Money";
import { useAccountBalance } from "@/lib/hooks/useAccounts";
import { mediumHaptic } from "@/ui/haptics";

/** Window frame of the row the long-press menu anchors to. */
export interface RowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Press feedback: a slow scale that reads as "held" during the long press that
 * opens the menu (module scope so the worklet isn't re-derived per row).
 */
const ROW_PRESS_ANIMATION = { scale: { value: 0.97, timingConfig: { duration: 450 } } };

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
 * A tappable account row (a `ListGroup.Item` wrapped in `PressableFeedback`, the
 * documented pattern for adding press feedback to list items). Tap navigates to
 * the account; long-press measures the row's frame and hands it to the screen,
 * which owns the anchored menu and floats a preview over the (hidden) row.
 */
export const AccountRow = memo(function AccountRow({
  account,
  onPress,
  onLongPress,
  isLifted = false,
}: AccountRowProps) {
  const rowViewRef = useRef<View>(null);

  return (
    <PressableFeedback
      animation={ROW_PRESS_ANIMATION}
      onPress={() => onPress(account)}
      onLongPress={() => {
        mediumHaptic();
        // Anchor the menu to this frame — measured in window coordinates, the
        // space the menu's portal lives in.
        rowViewRef.current?.measureInWindow((x, y, width, height) => {
          onLongPress(account, { x, y, width, height });
        });
      }}
    >
      <View ref={rowViewRef} className={cn("w-full", isLifted && "opacity-0")}>
        <AccountRowContent account={account} />
      </View>
    </PressableFeedback>
  );
});
