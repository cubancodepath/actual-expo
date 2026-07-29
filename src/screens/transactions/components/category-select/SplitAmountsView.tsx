import { Fragment, useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Menu, Separator, Typography, useThemeColor } from "heroui-native";
import { Check, CircleMinus, Minus, MoreHorizontal, Plus } from "lucide-react-native";
import { formatCents, signedCents } from "@/core/shared/util";
import { dialog } from "@/ui/feedback/dialog";
import { Screen } from "@/ui/Screen";
import { useHeaderActionOptions } from "@/ui/header-actions/useHeaderActionOptions";
import type { HeaderAction } from "@/ui/header-actions/types";
import { BlinkingCursor } from "@/ui/BlinkingCursor";
import { AmountKeyboard, useAmountKeyboardAvoidance } from "@/ui/amount-keyboard";
import { Money } from "@/ui/Money";
import type { CategoryRef, SplitLineForm } from "@/ui/entity-select/types";

/** A split line plus its UI-only direction (money in vs out). */
type DraftLine = SplitLineForm & { inflow: boolean };

interface SplitAmountsViewProps {
  /** One line per already-chosen category (amounts pre-filled when editing). */
  initialLines: SplitLineForm[];
  /** Transaction total in positive cents; the lines must balance against it. */
  totalCents: number;
  /** Direction of the total (drives signed math + each line's default). */
  isIncome: boolean;
  /** Shown on the info card; empty string renders the placeholder. */
  payeeName: string;
  /**
   * Balanced, cleaned lines. Length may be 1 — the caller maps a single line to
   * a plain category assignment. The view never navigates or persists.
   */
  onSave: (lines: SplitLineForm[]) => void;
  /** Open the caller's add-category picker (its own route). */
  onAddCategory: () => void;
  /** Return value from the add-category picker; consumed on focus. */
  pendingCategory: CategoryRef | null;
  onPendingConsumed: () => void;
}

/**
 * Split amounts editor: the categories were already chosen; here the user only
 * assigns an amount to each, and the signed amounts must sum to the total.
 * Form-agnostic — flows own persistence/navigation via `onSave`/`onAddCategory`,
 * and the add-category round trip travels through the `pendingCategory` props
 * (expo-router can't return values through `router.back()`).
 */
export function SplitAmountsView({
  initialLines,
  totalCents,
  isIncome,
  payeeName,
  onSave,
  onAddCategory,
  pendingCategory,
  onPendingConsumed,
}: SplitAmountsViewProps) {
  const { t } = useTranslation("transactions");
  const { t: tc } = useTranslation("common");
  const accent = useThemeColor("accent");
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const danger = useThemeColor("danger");

  // Each line carries its own direction (money in vs out), defaulting to the
  // transaction's type and flipped via the row's expense/income menu action.
  const [draft, setDraft] = useState<DraftLine[]>(() =>
    initialLines.map((l) => ({ ...l, inflow: isIncome })),
  );
  // A single category is a plain assignment, not a split: hide the running
  // total and the (irrelevant) per-line amount inputs.
  const isSplit = draft.length > 1;
  const setAmount = (i: number, cents: number) =>
    setDraft((d) => d.map((l, idx) => (idx === i ? { ...l, amount: cents } : l)));

  // Per-line amount editing via the in-app pad — the pad writes the line's draft
  // amount directly (few lines, so a per-keystroke map is cheap), so the row and
  // `remaining` stay live with no separate edit buffer.
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const closePad = useCallback(() => setEditingLine(null), []);

  // A plain ScrollView owns its own `onScroll`, so `scrollProps` can be spread
  // whole — the `setScrollY` bridge only existed because ScreenHeader.Body took
  // `onScroll` over for its blur.
  const { scrollRef, scrollProps, bottomPadding, scrollIntoView, onKeyboardHeightChange } =
    useAmountKeyboardAvoidance({
      basePadding: 24,
      editingPadding: 380,
      editing: editingLine != null,
    });

  // Signed maths so `remaining` conveys direction, not just magnitude: inflow
  // adds, outflow subtracts, and the total's sign follows the transaction type.
  // → remaining > 0 means "still needs inflow", < 0 means "still needs outflow".
  const signedTotal = signedCents(totalCents, isIncome);
  const signedSum = draft.reduce((acc, l) => acc + signedCents(l.amount, l.inflow), 0);
  const remaining = signedTotal - signedSum;

  // Explicit actions close the pad (tapping another line just switches).
  const toggleInflow = (i: number) => {
    closePad();
    setDraft((d) => d.map((l, idx) => (idx === i ? { ...l, inflow: !l.inflow } : l)));
  };

  const removeLine = (i: number) => {
    closePad();
    setDraft((d) => d.filter((_, idx) => idx !== i));
  };

  const addCategory = () => {
    closePad();
    onAddCategory();
  };

  // Consume a category picked on the "Add category" screen.
  useFocusEffect(
    useCallback(() => {
      if (!pendingCategory) return;
      const cat = pendingCategory;
      onPendingConsumed();
      if (draft.some((l) => l.categoryId === cat.id)) return;
      setDraft((d) => [
        ...d,
        { categoryId: cat.id, categoryName: cat.name, amount: 0, inflow: isIncome },
      ]);
    }, [pendingCategory, onPendingConsumed, draft, isIncome]),
  );

  const save = () => {
    // One category isn't a split — hand the single line back as-is (amounts are
    // irrelevant here, the parent keeps the full total).
    if (draft.length < 2) {
      onSave(draft.map<SplitLineForm>(({ inflow: _inflow, ...line }) => line));
      return;
    }

    // Real split (2+ lines): the signed amounts must balance the transaction.
    if (remaining !== 0) {
      dialog.alert({
        title: t("amountsDontMatchTitle"),
        message: t("amountsDontMatchMessage", { amount: formatCents(remaining) }),
      });
      return;
    }
    // Persist plain SplitLineForm (drop the UI-only `inflow` and empty lines).
    onSave(
      draft.filter((l) => l.amount > 0).map<SplitLineForm>(({ inflow: _inflow, ...line }) => line),
    );
  };

  // Back is the stack's own chevron; only the save action is ours. Memoised
  // because expo-router re-runs setOptions on every options identity change.
  const saveAction = useMemo<HeaderAction>(
    () => ({
      label: tc("save"),
      icon: { sfSymbol: "checkmark", lucide: Check },
      emphasis: "done",
      onPress: save,
    }),
    // `save` closes over the draft, so it must be re-read on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tc, draft, remaining],
  );
  const actionOptions = useHeaderActionOptions({ right: saveAction });

  const headerOptions = useMemo<NativeStackNavigationOptions>(
    () => ({ ...actionOptions, title: t("splitTransaction") }),
    [actionOptions, t],
  );

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={headerOptions} />

      <Screen>
        <ScrollView
          ref={scrollRef}
          {...scrollProps}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Payee card — info only (not tappable): the payee (or a placeholder)
            with the transaction total on the right. */}
          <ListGroup className="mb-4">
            <ListGroup.Item>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle className={payeeName ? undefined : "text-muted"}>
                  {payeeName || t("noPayeeSet")}
                </ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix>
                {/* Signed cents: outflow renders as "-$12.00" via Intl; inflow stays green. */}
                <Money cents={signedTotal} className="text-base font-semibold" />
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
          </ListGroup>

          {/* Group title (outside the card): "Categories" on the left, remaining on
            the right — followed by one row per selected category with its input. */}
          <View className="mb-1 ml-2 mr-2 flex-row items-center justify-between">
            <Typography className="text-xs font-semibold uppercase text-muted">
              {t("categories")}
            </Typography>
            {isSplit ? (
              <Typography className="text-xs font-semibold text-muted">
                {t("remaining", { amount: formatCents(remaining) })}
              </Typography>
            ) : null}
          </View>

          <ListGroup>
            {draft.map((line, i) => (
              <Fragment key={line.categoryId ?? i}>
                {i > 0 ? <Separator className="mx-4" /> : null}
                <ListGroup.Item>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle numberOfLines={1}>
                      {line.categoryName || t("selectCategory")}
                    </ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                  <ListGroup.ItemSuffix>
                    <View className="flex-row items-center gap-1">
                      {isSplit ? (
                        <Pressable
                          className="w-24 flex-row items-center justify-end"
                          onPress={(e) => {
                            setEditingLine(i);
                            scrollIntoView(e.nativeEvent.pageY);
                          }}
                        >
                          {/* Signed cents: outflow renders as "-$12.00" via Intl. */}
                          <Money
                            cents={signedCents(line.amount, line.inflow)}
                            className="text-base"
                          />
                          {editingLine === i ? <BlinkingCursor color={accent} /> : null}
                        </Pressable>
                      ) : null}
                      <Menu>
                        <Menu.Trigger asChild>
                          <Button
                            isIconOnly
                            variant="ghost"
                            size="sm"
                            className="rounded-full"
                            accessibilityLabel={tc("a11y.moreOptions")}
                          >
                            <MoreHorizontal size={18} color={muted} />
                          </Button>
                        </Menu.Trigger>
                        <Menu.Portal>
                          <Menu.Overlay />
                          <Menu.Content
                            presentation="popover"
                            width={220}
                            placement="bottom"
                            align="end"
                          >
                            <Menu.Item className="gap-3" onPress={() => toggleInflow(i)}>
                              {line.inflow ? (
                                <Minus size={18} color={foreground} />
                              ) : (
                                <Plus size={18} color={foreground} />
                              )}
                              <Menu.ItemTitle>
                                {line.inflow ? t("makeExpense") : t("makeIncome")}
                              </Menu.ItemTitle>
                            </Menu.Item>
                            <Menu.Item
                              className="gap-3"
                              variant="danger"
                              onPress={() => removeLine(i)}
                            >
                              <CircleMinus size={18} color={danger} />
                              <Menu.ItemTitle>{t("removeCategory")}</Menu.ItemTitle>
                            </Menu.Item>
                          </Menu.Content>
                        </Menu.Portal>
                      </Menu>
                    </View>
                  </ListGroup.ItemSuffix>
                </ListGroup.Item>
              </Fragment>
            ))}
          </ListGroup>

          <Button variant="outline" className="mt-3" onPress={addCategory}>
            <Plus size={18} color={foreground} />
            <Button.Label>{t("addCategory")}</Button.Label>
          </Button>
        </ScrollView>
      </Screen>

      {/* Multi-field screen: rows are their own triggers (tap switches), and only
          explicit actions close the pad — so no Overlay/DismissArea. */}
      <AmountKeyboard
        isOpen={editingLine != null}
        onClose={closePad}
        value={editingLine != null ? (draft[editingLine]?.amount ?? 0) : 0}
        onValueChange={(cents) => {
          if (editingLine != null) setAmount(editingLine, cents);
        }}
      >
        <AmountKeyboard.Portal>
          <AmountKeyboard.Panel onHeightChange={onKeyboardHeightChange} />
        </AmountKeyboard.Portal>
      </AmountKeyboard>
    </KeyboardAvoidingView>
  );
}

// paddingBottom comes from the keyboard-avoidance hook at render time.
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16 },
});
