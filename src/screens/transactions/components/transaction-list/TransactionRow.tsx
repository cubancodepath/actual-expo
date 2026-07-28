import { createContext, use, useMemo, type ReactNode } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, Separator, Typography, useThemeColor } from "heroui-native";
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
import { LiftMenu, type RowRect } from "@/ui/lift-menu";
import type { TransactionDisplay } from "@/core/types/models";

/** What every piece of the row reads; provided by `TransactionRow.Root`. */
interface TransactionRowContextValue {
  txn: TransactionDisplay;
  /** Whether the category is an income one — chip shows "Income: X" + wallet. */
  isIncome: boolean;
  /**
   * Schedule link indicator shown before the payee: "recurring" (cyclic arrows)
   * or "once" (calendar). `null` when the txn isn't linked to one.
   */
  scheduleKind: "recurring" | "once" | null;
}

const TransactionRowContext = createContext<TransactionRowContextValue | null>(null);

function useTransactionRow(): TransactionRowContextValue {
  const ctx = use(TransactionRowContext);
  if (!ctx) {
    throw new Error("TransactionRow.* pieces must be rendered inside TransactionRow.Root");
  }
  return ctx;
}

export interface LedgerRowProps {
  txn: TransactionDisplay;
  /** First row of its date block — no separator above it. */
  isFirst: boolean;
  onPress?: (txn: TransactionDisplay) => void;
  /**
   * Open the transaction menu for this row. `rect` is the row's window frame,
   * which the menu host uses to anchor the menu and float the lifted preview.
   */
  onLongPress?: (txn: TransactionDisplay, rect: RowRect) => void;
  /**
   * Whether the menu is open on this row AND its floating preview is up. The
   * row hides itself then, so the preview replaces it without a seam.
   */
  isLifted?: boolean;
  isIncome?: boolean;
  scheduleKind?: "recurring" | "once" | null;
}

interface RootProps extends LedgerRowProps {
  children: ReactNode;
}

/**
 * Frame of a two-line ledger row inside a date block's full-width card: the
 * surface strip, the separator, and the lift-menu press wiring. The lines are
 * composed by the caller from the kit's pieces (`Main`/`Meta`/`Payee`/…).
 */
function Root({
  txn,
  isFirst,
  onPress,
  onLongPress,
  isLifted = false,
  isIncome = false,
  scheduleKind = null,
  children,
}: RootProps) {
  const value = useMemo(() => ({ txn, isIncome, scheduleKind }), [txn, isIncome, scheduleKind]);

  return (
    <TransactionRowContext value={value}>
      <View className="bg-surface">
        {!isFirst && <Separator className="ml-4" />}
        <LiftMenu.Row
          onPress={onPress && (() => onPress(txn))}
          onLongPress={onLongPress && ((rect) => onLongPress(txn, rect))}
          isLifted={isLifted}
          contentClassName="gap-0.5 px-4 py-2.5"
        >
          {children}
        </LiftMenu.Row>
      </View>
    </TransactionRowContext>
  );
}

/** Line 1 layout: payee on the left, amount on the right. */
function Main({ children }: { children: ReactNode }) {
  return <View className="flex-row items-center gap-2">{children}</View>;
}

/** Line 2 layout: category chip on the left, extra meta on the right. */
function Meta({ children }: { children: ReactNode }) {
  return <View className="flex-row items-center gap-2">{children}</View>;
}

/** Payee name with the schedule-link and transfer-direction indicators. */
function Payee() {
  const { txn, scheduleKind } = useTransactionRow();
  const { t } = useTranslation("transactions");
  const muted = useThemeColor("muted");

  return (
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
  );
}

/** Amount plus the reconciled / cleared / uncleared status indicator. */
function Amount() {
  const { txn } = useTransactionRow();
  const muted = useThemeColor("muted");
  const surface = useThemeColor("surface");
  const positive = useCSSVariable("--positive") as string;

  return (
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
  );
}

/** The category chip, with the special-category / uncategorized / income looks. */
function CategoryChip() {
  const { txn, isIncome } = useTransactionRow();
  const { t } = useTranslation("transactions");
  const [accent, warning] = useThemeColor(["accent", "warning"]);
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
  );
}

/** The account name, muted, on the right of the meta line. */
function Account() {
  const { txn } = useTransactionRow();
  return txn.accountName ? (
    <Typography className="text-sm text-muted font-normal" numberOfLines={1}>
      {txn.accountName}
    </Typography>
  ) : null;
}

/**
 * Compound kit for a two-line ledger row. Screens don't compose this inline in
 * `renderItem` — that would defeat row memoization; the memoized variants in
 * `LedgerRow.tsx` are the only entry points for lists. Add pieces here, decide
 * their arrangement there.
 */
export const TransactionRow = {
  Root,
  Main,
  Meta,
  Payee,
  Amount,
  CategoryChip,
  Account,
};
