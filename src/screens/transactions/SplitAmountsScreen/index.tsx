import { Fragment, useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSelector } from "@tanstack/react-store";
import {
  Button,
  Dialog,
  ListGroup,
  Menu,
  Separator,
  Typography,
  useThemeColor,
} from "heroui-native";
import { Check, CircleMinus, Minus, MoreHorizontal, Plus } from "lucide-react-native";
import { formatCents } from "@/lib/currency";
import { ScreenHeader } from "@/components/ScreenHeader";
import { AmountInput } from "@/screens/transactions/components/AmountInput";
import { AmountText } from "@/screens/transactions/components/AmountText";
import { useTransactionForm } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";
import type { SplitLineForm } from "@/screens/transactions/NewTransactionScreen/validation/transactionForm.schema";

/** A split line plus its UI-only direction (money in vs out). */
type DraftLine = SplitLineForm & { inflow: boolean };

/**
 * Split amounts screen: the categories were already chosen (checked) in the
 * category picker and passed in as `ids`. Here the user only assigns an amount to
 * each; the amounts must sum to the transaction total. Saving writes the split
 * back to the shared form and returns to the `new` screen.
 */
export function SplitAmountsScreen() {
  const { t } = useTranslation("transactions");
  const router = useRouter();
  const accentForeground = useThemeColor("accent-foreground");
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const danger = useThemeColor("danger");

  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const { form, categories, actions, pendingSplitCategory, setPendingSplitCategory } =
    useTransactionForm();
  const total = useSelector(form.store, (s) => s.values.amount);
  const payeeName = useSelector(form.store, (s) => s.values.payeeName);
  const type = useSelector(form.store, (s) => s.values.type);
  const existing = useSelector(form.store, (s) => s.values.splitLines);

  // Build one line per selected category, pre-filling the amount from an existing
  // split (when editing) or 0 (when creating). Keyed on `ids` only — the initial
  // draft should not reset while the user types.
  const initial = useMemo<SplitLineForm[]>(
    () =>
      (ids ?? "")
        .split(",")
        .filter(Boolean)
        .map((id) => ({
          categoryId: id,
          categoryName: categories.find((c) => c.id === id)?.name ?? "",
          amount: existing?.find((l) => l.categoryId === id)?.amount ?? 0,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids],
  );

  // Each line carries its own direction (money in vs out), defaulting to the
  // transaction's type and flipped via the row's expense/income menu action.
  const [draft, setDraft] = useState<DraftLine[]>(() =>
    initial.map((l) => ({ ...l, inflow: type === "income" })),
  );
  // Shown (as a HeroUI Dialog) when Save is attempted but the amounts don't sum
  // to the transaction total.
  const [mismatchOpen, setMismatchOpen] = useState(false);

  // A single category is a plain assignment, not a split: hide the running
  // total and the (irrelevant) per-line amount inputs.
  const isSplit = draft.length > 1;
  // Signed maths so `remaining` conveys direction, not just magnitude: inflow
  // adds, outflow subtracts, and the total's sign follows the transaction type.
  // → remaining > 0 means "still needs inflow", < 0 means "still needs outflow".
  const signedTotal = type === "income" ? total : -total;
  const signedSum = draft.reduce((acc, l) => acc + (l.inflow ? l.amount : -l.amount), 0);
  const remaining = signedTotal - signedSum;

  const setAmount = (i: number, cents: number) =>
    setDraft((d) => d.map((l, idx) => (idx === i ? { ...l, amount: cents } : l)));

  const toggleInflow = (i: number) =>
    setDraft((d) => d.map((l, idx) => (idx === i ? { ...l, inflow: !l.inflow } : l)));

  const removeLine = (i: number) => setDraft((d) => d.filter((_, idx) => idx !== i));

  const addCategory = () => router.push("/(auth)/transaction/split-add-category");

  // Consume a category picked on the "Add category" screen (returned via context,
  // since expo-router can't pass values back through `router.back()`).
  useFocusEffect(
    useCallback(() => {
      if (!pendingSplitCategory) return;
      const cat = pendingSplitCategory;
      setPendingSplitCategory(null);
      if (draft.some((l) => l.categoryId === cat.id)) return;
      setDraft((d) => [
        ...d,
        { categoryId: cat.id, categoryName: cat.name, amount: 0, inflow: type === "income" },
      ]);
    }, [pendingSplitCategory, setPendingSplitCategory, draft, type]),
  );

  const save = () => {
    // Persist plain SplitLineForm (drop the UI-only `inflow`).
    const cleaned = draft
      .filter((l) => l.amount > 0)
      .map<SplitLineForm>((l) => ({
        id: l.id,
        categoryId: l.categoryId,
        categoryName: l.categoryName,
        amount: l.amount,
      }));

    // One category isn't a split — assign it to the parent as a normal category
    // (amounts are irrelevant here, the parent already holds the full total).
    if (draft.length < 2) {
      const only = draft[0];
      if (only?.categoryId) {
        actions.selectCategory({
          id: only.categoryId,
          name: only.categoryName,
        });
      }
      actions.setSplitLines(null);
      router.dismissTo("/(auth)/transaction/new");
      return;
    }

    // Real split (2+ lines): the signed amounts must balance the transaction.
    if (remaining !== 0) {
      setMismatchOpen(true);
      return;
    }
    actions.setSplitLines(cleaned.length ? cleaned : null);
    // Back to `new` regardless of how we got here (picker→split, or split direct).
    router.dismissTo("/(auth)/transaction/new");
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScreenHeader>
        <ScreenHeader.Back />
        <ScreenHeader.Title>{t("splitTransaction")}</ScreenHeader.Title>
        <ScreenHeader.Actions>
          <Button isIconOnly className="rounded-full" onPress={save}>
            <Check size={22} color={accentForeground} />
          </Button>
        </ScreenHeader.Actions>
      </ScreenHeader>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
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
              <AmountText
                value={total}
                inflow={type === "income"}
                className="text-base font-semibold"
              />
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
                      <AmountInput
                        value={line.amount}
                        inflow={line.inflow}
                        onChange={(c) => setAmount(i, c)}
                        className="w-24"
                      />
                    ) : null}
                    <Menu>
                      <Menu.Trigger asChild>
                        <Button isIconOnly variant="ghost" size="sm" className="rounded-full">
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

      <Dialog isOpen={mismatchOpen} onOpenChange={setMismatchOpen}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <View className="mb-5 gap-1.5">
              <Dialog.Title>{t("amountsDontMatchTitle")}</Dialog.Title>
              <Dialog.Description>
                {t("amountsDontMatchMessage", {
                  amount: formatCents(remaining),
                })}
              </Dialog.Description>
            </View>
            <Button onPress={() => setMismatchOpen(false)}>
              <Button.Label>{t("ok", { ns: "common" })}</Button.Label>
            </Button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
});
