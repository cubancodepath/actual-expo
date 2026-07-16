import { Fragment, useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { CirclePlus, Plus } from "lucide-react-native";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { envelopeBudget, sheetForMonth } from "@/core/domain/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/domain/spreadsheet/instance";
import { setBudgetAmount, transferMultipleCategories } from "@/core/domain/budgets";
import { batchMessages } from "@/core/sync/batch";
import { TO_BUDGET_ID } from "@/screens/budget/constants";
import { CloseButton } from "@/ui/CloseButton";
import { AmountKeyboard, useAmountKeyboardAvoidance } from "@/ui/amount-keyboard";
import { Money } from "@/ui/Money";
import { SourceRow } from "./components/SourceRow";

/** How far the sources card overlaps the hero's curved bottom at rest. */
const CARD_OVERLAP = 36;
/** Height of the back layer's curved zone, fully below the front layer's edge. */
const HERO_CURVE = 56;
/** Hero height before its first onLayout measurement. */
const HERO_HEIGHT_FALLBACK = 180;

interface SourceEntry {
  id: string;
  name: string;
  /** The source's available balance in cents when it was picked. */
  balance: number;
  /** Cents taken from this source. */
  amount: number;
}

/**
 * Cover-source screen: pick funding sources and how much to take from each to
 * cover an overspent category. Same hero language as the transaction screen —
 * a tinted block (warning while money is still needed, success once covered)
 * with the remaining amount, its curved bottom overlapped by the sources card,
 * and a floating close button. Amounts are edited with the in-app AmountKeyboard
 * (rows are their own triggers); saving writes all sources in one batch.
 */
export function CoverSourceScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const accent = useThemeColor("accent");
  const { catId, catName, balance } = useLocalSearchParams<{
    catId: string;
    catName: string;
    balance: string;
  }>();

  const month = useBudgetUIStore((s) => s.month);
  const coverTarget = useBudgetUIStore((s) => s.coverTarget);
  const setCoverTarget = useBudgetUIStore((s) => s.setCoverTarget);

  const balanceCents = Math.abs(Number(balance));
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [heroHeight, setHeroHeight] = useState(HERO_HEIGHT_FALLBACK);

  const totalCovered = sources.reduce((sum, s) => sum + s.amount, 0);
  const remaining = balanceCents - totalCovered;
  const isCovered = remaining <= 0 && sources.length > 0;

  // Per-row amount editing via the in-app pad — the pad writes the row's amount
  // directly (few rows), so the row chip and the hero amount stay live.
  const [editingId, setEditingId] = useState<string | null>(null);
  const closePad = useCallback(() => setEditingId(null), []);

  const { scrollRef, scrollProps, bottomPadding, scrollIntoView, onKeyboardHeightChange } =
    useAmountKeyboardAvoidance({
      basePadding: 96,
      editingPadding: 380,
      editing: editingId != null,
    });

  const onPressAmount = useCallback(
    (id: string, pageY: number) => {
      setEditingId(id);
      scrollIntoView(pageY);
    },
    [scrollIntoView],
  );

  const handleAddCategory = useCallback(() => {
    router.push({
      pathname: "/(auth)/budget/cover-category-picker",
      params: { excludeIds: sources.map((s) => s.id).join(","), overspentCatId: catId },
    });
  }, [router, sources, catId]);

  // Open the picker shortly after mount when arriving with no sources yet.
  useEffect(() => {
    if (sources.length === 0) {
      const timer = setTimeout(() => handleAddCategory(), 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up the source chosen in the picker (via budgetUIStore.coverTarget),
  // defaulting its amount to what's still needed, capped by its balance.
  useEffect(() => {
    if (!coverTarget) return;
    const { catId: srcId, catName: srcName, balance: srcBalance } = coverTarget;
    setCoverTarget(null);
    if (sources.some((s) => s.id === srcId)) return;
    const defaultAmount = Math.min(Math.abs(srcBalance), Math.max(remaining, 0));
    setSources((prev) => [
      ...prev,
      { id: srcId, name: srcName, balance: srcBalance, amount: defaultAmount },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverTarget]);

  async function handleCover() {
    if (!catId || saving || totalCovered === 0) return;
    closePad();
    setSaving(true);
    try {
      const toBudgetSource = sources.find((s) => s.id === TO_BUDGET_ID && s.amount > 0);
      const categorySources = sources.filter((s) => s.id !== TO_BUDGET_ID && s.amount > 0);

      // One batch = one undo step and one sync cycle for both source kinds.
      await batchMessages(async () => {
        if (toBudgetSource) {
          const ss = getSpreadsheet();
          const sheet = sheetForMonth(month);
          const currentBudgeted =
            (ss.getValue(sheet, envelopeBudget.catBudgeted(catId)) as number) ?? 0;
          const newAmount = currentBudgeted + toBudgetSource.amount;
          ss.setByName(sheet, envelopeBudget.catBudgeted(catId), newAmount); // instant UI
          await setBudgetAmount(month, catId, newAmount);
        }
        if (categorySources.length > 0) {
          await transferMultipleCategories(
            month,
            catId,
            categorySources.map((s) => ({ categoryId: s.id, amountCents: s.amount, name: s.name })),
            "to",
            catName,
          );
        }
      });
      router.dismiss(2); // close cover-source + cover-overspent
    } finally {
      setSaving(false);
    }
  }

  const heroTint = isCovered ? "bg-success/70" : "bg-danger/70";
  const heroRadii = { borderBottomLeftRadius: 56, borderBottomRightRadius: 56 };

  return (
    <>
      {/* Hero BACK layer: the curved slab the cards rest on. Sits behind the
          (transparent) ScrollView; only its bottom curve peeks out under the
          cards. Opaque composite: solid background + tint. */}
      {/* The curve zone sits entirely BELOW the front layer's straight edge, so
          the front's square corners rest on the still-straight part of the back
          (invisible seam) and the curve + card overlap stay visible. */}
      <View className="absolute inset-x-0 top-0" style={{ height: heroHeight + HERO_CURVE }}>
        <View className="absolute inset-0 bg-background" style={heroRadii} />
        <View className={`absolute inset-0 ${heroTint}`} style={heroRadii} />
      </View>

      {/* The ScrollView must be the screen ROOT-level scroll: inside this
          formSheet a plain flex-1 View root does not paint its scroll content.
          Transparent so the hero back layer shows through; the route's
          contentStyle paints the page background. */}
      <ScrollView
        ref={scrollRef}
        {...scrollProps}
        className="flex-1"
        contentContainerStyle={{
          // Cards start inside the back layer's curve zone (overlapping it) and
          // slide BEHIND the front layer when scrolling — the sandwich.
          paddingTop: heroHeight + HERO_CURVE - CARD_OVERLAP,
          paddingBottom: bottomPadding,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-2 px-4">
          {sources.length > 0 ? (
            <ListGroup className="overflow-hidden rounded-2xl">
              {sources.map((s, i) => (
                <Fragment key={s.id}>
                  {i > 0 ? <Separator className="mx-4" /> : null}
                  <SourceRow
                    id={s.id}
                    name={s.name}
                    balance={s.balance}
                    amount={s.amount}
                    isEditing={editingId === s.id}
                    onPressAmount={onPressAmount}
                  />
                </Fragment>
              ))}
              {/* "Add another" lives inside the card as its last, link-style row
                  (centered icon + label, like the legacy add pressable). */}
              <Separator className="mx-4" />
              <ListGroup.Item onPress={handleAddCategory}>
                <View className="flex-1 flex-row items-center justify-center gap-2">
                  <CirclePlus size={18} color={accent} />
                  <Typography className="text-base font-semibold text-accent">
                    {t("addAnother")}
                  </Typography>
                </View>
              </ListGroup.Item>
            </ListGroup>
          ) : (
            <Button variant="tertiary" onPress={handleAddCategory}>
              <Plus size={18} color={foreground} />
              <Button.Label>{t("addCategory")}</Button.Label>
            </Button>
          )}
        </View>
      </ScrollView>

      {/* Hero FRONT layer: same tint, square bottom edge, opaque — scrolled
          cards vanish behind it. Ends CARD_OVERLAP above the back layer's
          curve, leaving the "slot" the cards slide into (the sandwich). */}
      <View
        className="absolute inset-x-0 top-0 z-10 overflow-hidden"
        onLayout={(e) => setHeroHeight(e.nativeEvent.layout.height)}
      >
        <View className="absolute inset-0 bg-background" />
        <View className={`absolute inset-0 ${heroTint}`} />
        <View className="items-center gap-1 px-6 pt-18 pb-4">
          <Typography className="text-base font-semibold text-foreground">{catName}</Typography>
          <Money cents={-remaining} tone="plain" className="text-3xl font-bold text-foreground" />
        </View>
        <View className="absolute left-4 top-4 z-10">
          <CloseButton onPress={() => router.back()} />
        </View>
      </View>

      {/* Cover as a labelled FAB (AddTransactionFab pattern), hidden while the
          amount pad is open. */}
      {editingId == null && (
        <View className="absolute bottom-8 right-5">
          <Button
            isDisabled={totalCovered === 0 || saving}
            onPress={handleCover}
            className="h-14 rounded-full px-8 shadow-lg"
          >
            <Button.Label>{t(saving ? "coveringEllipsis" : "cover")}</Button.Label>
          </Button>
        </View>
      )}

      {/* Rows are their own triggers (tap switches), so no Overlay/DismissArea. */}
      <AmountKeyboard
        isOpen={editingId != null}
        onClose={closePad}
        value={editingId != null ? (sources.find((s) => s.id === editingId)?.amount ?? 0) : 0}
        onValueChange={(cents) => {
          if (editingId != null) {
            setSources((prev) =>
              prev.map((s) => (s.id === editingId ? { ...s, amount: cents } : s)),
            );
          }
        }}
      >
        <AmountKeyboard.Portal>
          <AmountKeyboard.Panel onHeightChange={onKeyboardHeightChange} />
        </AmountKeyboard.Portal>
      </AmountKeyboard>
    </>
  );
}
