import { memo, useRef } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, cn, PressableFeedback, Separator, Typography, useThemeColor } from "heroui-native";
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Calendar,
  Copyright,
  Inbox,
  Lock,
  Repeat,
  WalletCards,
} from "lucide-react-native";
import { useCSSVariable } from "uniwind";
import { Money } from "@/ui/Money";
import { mediumHaptic } from "@/ui/haptics";
import type { TransactionDisplay } from "@/core/domain/transactions/types";
import type { RowRect } from "./TransactionRowMenu";

/**
 * Press feedback: a slow scale that's barely visible on a quick edit tap, but
 * reads as clearly "held" during the long press that opens the menu. Module
 * scope — a fresh object here would re-derive the worklet on every row render.
 */
const ROW_PRESS_ANIMATION = {
  scale: { value: 0.97, timingConfig: { duration: 450 } },
};

interface TransactionRowProps {
  txn: TransactionDisplay;
  /** First row of its date block — no separator above it. */
  isFirst: boolean;
  onPress: (txn: TransactionDisplay) => void;
  /**
   * Open the transaction menu for this row. `rect` is the row's window frame,
   * which the screen uses to anchor the menu and float the lifted preview.
   */
  onLongPress: (txn: TransactionDisplay, rect: RowRect) => void;
  /**
   * Whether the menu is open on this row AND its floating preview is up. The
   * row hides itself then, so the preview replaces it without a seam.
   */
  isLifted?: boolean;
  /** Whether the category is an income one — chip shows "Income: X" + wallet. */
  isIncome?: boolean;
  /**
   * Schedule link indicator shown before the payee: "recurring" (cyclic arrows)
   * or "once" (calendar). `null`/undefined when the txn isn't linked to one.
   */
  scheduleKind?: "recurring" | "once" | null;
}

/**
 * Two-line ledger row inside a date block's full-width card:
 * payee — amount + cleared indicator / category — account. Memoised so
 * paging in more rows doesn't re-render the existing ones.
 */
export const TransactionRow = memo(function TransactionRow({
  txn,
  isFirst,
  onPress,
  onLongPress,
  isLifted = false,
  isIncome = false,
  scheduleKind = null,
}: TransactionRowProps) {
  const { t } = useTranslation("transactions");
  const rowViewRef = useRef<View>(null);
  const [muted, accent, warning] = useThemeColor(["muted", "accent", "warning"]);
  const surface = useThemeColor("surface");
  const positive = useCSSVariable("--positive") as string;

  // "Special category" label, mirroring the original app: off-budget accounts,
  // transfers, and split parents replace the real category in the chip.
  const isTransfer = txn.isTransfer && !txn.transferAccountOffbudget;
  const specialCategory = txn.accountOffbudget
    ? t("offBudget")
    : isTransfer
      ? t("transfer")
      : txn.is_parent
        ? t("split")
        : null;
  const chipLabel = specialCategory ?? txn.categoryName;
  const isUncategorized = chipLabel == null;

  return (
    <View className="bg-surface">
      {!isFirst && <Separator className="ml-4" />}
      <PressableFeedback
        animation={ROW_PRESS_ANIMATION}
        onPress={() => onPress(txn)}
        onLongPress={() => {
          mediumHaptic();
          // The screen anchors the menu to this frame, so it has to be measured
          // in window coordinates — the same space the menu's portal lives in.
          rowViewRef.current?.measureInWindow((x, y, width, height) => {
            onLongPress(txn, { x, y, width, height });
          });
        }}
      >
        <View
          ref={rowViewRef}
          className={cn("w-full gap-0.5 px-4 py-2.5", isLifted && "opacity-0")}
        >
          <View className="flex-row items-center gap-2">
            <View className="flex-1 flex-row items-center gap-1">
              {/* Schedule link: recurring (cyclic arrows) or one-time (calendar),
                  matching the original app's PayeeIcons. */}
              {scheduleKind === "recurring" ? (
                <Repeat size={14} color={muted} />
              ) : scheduleKind === "once" ? (
                <Calendar size={14} color={muted} />
              ) : null}
              {/* Transfer direction, matching the original: money in → left,
                  money out → right. Shown for any transfer payee. */}
              {txn.isTransfer &&
                (txn.amount > 0 ? (
                  <ArrowLeft size={14} color={muted} />
                ) : (
                  <ArrowRight size={14} color={muted} />
                ))}
              <Typography className="flex-1 text-base text-foreground" numberOfLines={1}>
                {txn.payeeName ?? t("noPayee")}
              </Typography>
            </View>
            <View className="flex-row items-center gap-1">
              <Money cents={txn.amount} />
              {/* Status indicator. Lucide has no filled variants; filling the
                  shape and stroking in the row's surface color fakes one. */}
              {txn.reconciled ? (
                <Lock size={14} color={muted} />
              ) : txn.cleared ? (
                <Copyright size={16} color={surface} fill={positive} />
              ) : (
                <Copyright size={14} color={muted} />
              )}
            </View>
          </View>
          <View className="flex-row items-center gap-2">
            <View className="flex-1 flex-row">
              {/* The Chip renders its own Pressable — pointerEvents="none" lets the
                  touch fall through to the row's PressableFeedback. */}
              <Chip
                variant="soft"
                color={
                  specialCategory
                    ? "accent"
                    : isUncategorized
                      ? "warning"
                      : isIncome
                        ? "success"
                        : "default"
                }
                size="sm"
                pointerEvents="none"
                className="rounded-md"
              >
                {isTransfer && <ArrowRightLeft size={14} color={accent} />}
                {isUncategorized && <Inbox size={14} color={warning} />}
                {!specialCategory && isIncome && <WalletCards size={14} color={positive} />}
                <Chip.Label numberOfLines={1} className="text-foreground font-normal">
                  {isUncategorized
                    ? t("uncategorized")
                    : specialCategory
                      ? specialCategory
                      : isIncome
                        ? t("list.incomeCategory", { name: txn.categoryName })
                        : txn.categoryName}
                </Chip.Label>
              </Chip>
            </View>
            {txn.accountName ? (
              <Typography className="text-sm text-muted font-normal" numberOfLines={1}>
                {txn.accountName}
              </Typography>
            ) : null}
          </View>
        </View>
      </PressableFeedback>
    </View>
  );
});
