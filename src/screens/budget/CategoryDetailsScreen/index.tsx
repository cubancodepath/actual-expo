import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  Button,
  ListGroup,
  Separator,
  Surface,
  TextArea,
  Typography,
  useThemeColor,
} from "heroui-native";
import { Eye, EyeOff, Target, TextCursorInput, Trash2, X } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { Money } from "@/ui/Money";
import { AvailableChip } from "@/screens/budget/BudgetScreen/components/AvailableChip";
import { categoryChipStatus } from "@/screens/budget/BudgetScreen/chipStatus";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { useSheetValue, useSheetValueNumber } from "@/hooks/useSheetValue";
import { envelopeBudget, sheetForMonth } from "@/core/server/spreadsheet/bindings";
import { useCategories } from "@/lib/hooks/useCategories";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { updateCategory } from "@/core/server/budget";
import { useDeleteCategory } from "@/screens/budget/hooks/useDeleteCategory";
import { setNote } from "@/core/server/notes";
import { getCategoryNote } from "@/core/server/budget/goal-template";
import { parseGoalDef } from "@/core/server/budget/goal-template-parser";
import { describeTemplate } from "@/screens/budget/goals";
import { dialog } from "@/ui/feedback/dialog/dialogStore";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { useSurfaceLevel } from "@/ui/surface-level";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Localised full month name for a `YYYY-MM` string. */
function monthName(yyyymm: string, locale: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString(locale, { month: "long" });
}

/** The `YYYY-MM` string one month before the given one. */
function prevMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export interface CategoryDetailsScreenProps {
  categoryId: string;
}

/**
 * Category detail modal: a balance breakdown (carry-in / budgeted / activity /
 * available pill), the goal card, the category note, and rename/delete actions.
 * The heroui replacement for the legacy `EditCategoryScreen`.
 */
export function CategoryDetailsScreen({ categoryId }: CategoryDetailsScreenProps) {
  const { itemVariant } = useSurfaceLevel();
  const { t, i18n } = useTranslation("budget");
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const accent = useThemeColor("accent");
  const danger = useThemeColor("danger");
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  // The structured goal editor is the `goalTemplatesUIEnabled` sub-feature. With
  // it off (the default after enabling goals) the goal card is read-only: goals
  // still show and apply under the parent flag, authored via note directives.
  const goalEditorEnabled = useFeatureFlag("goalTemplatesUIEnabled");

  const month = useBudgetUIStore((s) => s.month);

  const { categories, groups } = useCategories();
  const category = categories.find((c) => c.id === categoryId);
  const isIncome = groups.find((g) => g.id === category?.group)?.is_income ?? false;
  const categoryName = category?.name ?? t("category");

  // ── Spreadsheet-driven month data ──
  const sheet = sheetForMonth(month);
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.catBudgeted(categoryId));
  const spent = useSheetValueNumber(sheet, envelopeBudget.catSpent(categoryId));
  const balance = useSheetValueNumber(sheet, envelopeBudget.catBalance(categoryId));
  // The previous month's leftover is this month's carry-in ("From <month>").
  const carryIn = useSheetValueNumber(
    sheetForMonth(prevMonth(month)),
    envelopeBudget.catBalance(categoryId),
  );
  const carryoverRaw = useSheetValue(sheet, envelopeBudget.catCarryover(categoryId));
  const carryover = carryoverRaw === true || carryoverRaw === 1;
  const goalRaw = useSheetValue(sheet, envelopeBudget.catGoal(categoryId));
  const goal = typeof goalRaw === "number" ? goalRaw : null;
  const longGoalRaw = useSheetValue(sheet, envelopeBudget.catLongGoal(categoryId));
  const longGoal = longGoalRaw === true || longGoalRaw === 1;

  const chipStatus = categoryChipStatus({ balance, budgeted, goal, longGoal, goalsEnabled });

  const currentMonth = monthName(month, i18n.language);
  const previousMonth = monthName(prevMonth(month), i18n.language);

  // ── Goal description ──
  const templates = parseGoalDef(category?.goal_def ?? null);
  const hasGoal = goalsEnabled && templates.length > 0;
  const goalDescription = hasGoal ? describeTemplate(templates[0], t, i18n.language) : null;

  // ── Category note (editable, autosaved on blur / unmount) ──
  // The note is plain user text — a separate entity from the goal. Legacy
  // #template/#goal lines (only present in budgets authored on desktop) show
  // and edit verbatim, matching upstream's notes editor.
  const [noteText, setNoteText] = useState("");
  const [noteBaseline, setNoteBaseline] = useState("");
  useEffect(() => {
    let active = true;
    getCategoryNote(categoryId)
      .then((full) => {
        if (!active) return;
        setNoteText(full ?? "");
        setNoteBaseline(full ?? "");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [categoryId]);

  async function saveNote() {
    if (noteText === noteBaseline) return;
    try {
      await setNote(categoryId, noteText.trim() ? noteText : null);
      setNoteBaseline(noteText);
    } catch (e) {
      emitErrorEvent(e);
    }
  }

  // Persist on unmount too — closing the modal may not fire the field's blur.
  const saveNoteRef = useRef(saveNote);
  saveNoteRef.current = saveNote;
  useEffect(() => {
    return () => {
      saveNoteRef.current();
    };
  }, []);

  // Shared with the plan editor — see useDeleteCategory for why the transfer
  // check happens before the dialog rather than after it.
  const { requestDelete, isDeleting } = useDeleteCategory({ onDeleted: () => router.back() });

  async function handleToggleHidden() {
    if (category?.hidden) {
      updateCategory(categoryId, { hidden: false });
      return;
    }
    const ok = await dialog.confirm({
      title: t("categoryHiddenTitle"),
      message: t("categoryHiddenMessage"),
      confirmLabel: t("hideCategory"),
    });
    if (!ok) return;
    updateCategory(categoryId, { hidden: true });
    router.back();
  }

  const openGoal = () => router.push({ pathname: "/(auth)/budget/goal", params: { categoryId } });

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardAware
      >
        {/* ── Balance card ── */}
        <ListGroup variant={itemVariant} className="mb-6">
          {!isIncome ? (
            <>
              <BalanceRow label={t("fromMonth", { month: previousMonth })} cents={carryIn} />
              <Separator className="mx-4" />
              <BalanceRow label={t("assignedForMonth", { month: currentMonth })} cents={budgeted} />
              <Separator className="mx-4" />
            </>
          ) : null}
          <BalanceRow
            label={
              isIncome
                ? t("receivedInMonth", { month: currentMonth })
                : t("activityInMonth", { month: currentMonth })
            }
            cents={spent}
          />
          {!isIncome ? (
            <>
              <Separator className="mx-4" />
              <ListGroup.Item disabled>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle className="font-semibold">
                    {t("available")}
                  </ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix>
                  <AvailableChip cents={balance} status={chipStatus} carryover={carryover} />
                </ListGroup.ItemSuffix>
              </ListGroup.Item>
            </>
          ) : null}
        </ListGroup>

        {/* ── Goal card ── */}
        {/* With the editor off and no goal there's nothing to show or author
            here (notes remain the authoring surface), so the card is hidden. */}
        {goalsEnabled && !isIncome && (hasGoal || goalEditorEnabled) ? (
          <View className="mb-6">
            <Typography className="mb-2 ml-2 text-sm font-medium text-muted">
              {t("goalSection")}
            </Typography>
            <Surface variant={itemVariant} className="items-center gap-3 rounded-2xl p-4">
              <Target size={26} color={hasGoal ? foreground : muted} />
              {hasGoal ? (
                goalDescription ? (
                  <Typography className="text-center text-sm text-muted">
                    {goalDescription}
                  </Typography>
                ) : null
              ) : (
                <>
                  <Typography className="text-center text-base font-semibold text-foreground">
                    {t("wantToSetGoal")}
                  </Typography>
                  <Typography className="text-center text-sm text-muted">
                    {t("targetsHelpPlan")}
                  </Typography>
                </>
              )}
              {goalEditorEnabled ? (
                <Button
                  variant={hasGoal ? "secondary" : "primary"}
                  className="self-stretch"
                  onPress={openGoal}
                >
                  <Button.Label>{hasGoal ? t("editGoal") : t("addGoal")}</Button.Label>
                </Button>
              ) : null}
            </Surface>
          </View>
        ) : null}

        {/* ── Note card ── */}
        <View className="mb-6">
          <Typography className="mb-2 ml-2 text-sm font-medium text-muted">
            {t("noteSection")}
          </Typography>
          <TextArea
            value={noteText}
            onChangeText={setNoteText}
            onBlur={saveNote}
            placeholder={t("notePlaceholder")}
            className="h-16"
          />
        </View>

        {/* ── Actions ── */}
        <View className="gap-2">
          <Button
            variant="secondary"
            className="self-stretch"
            onPress={() =>
              router.push({
                pathname: "/(auth)/budget/rename-category",
                params: { categoryId, currentName: categoryName },
              })
            }
          >
            <TextCursorInput size={18} color={accent} />
            <Button.Label>{t("renameCategory")}</Button.Label>
          </Button>
          <Button variant="secondary" className="self-stretch" onPress={handleToggleHidden}>
            {category?.hidden ? (
              <Eye size={18} color={accent} />
            ) : (
              <EyeOff size={18} color={accent} />
            )}
            <Button.Label>{category?.hidden ? t("showCategory") : t("hideCategory")}</Button.Label>
          </Button>
          <Button
            variant="secondary"
            className="self-stretch"
            isDisabled={isDeleting}
            onPress={() => void requestDelete({ id: categoryId, name: categoryName })}
          >
            <Trash2 size={18} color={danger} />
            <Button.Label className="text-danger">{t("deleteCategory")}</Button.Label>
          </Button>
        </View>
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <ScreenHeader>
          <ScreenHeader.Back>
            <Button
              variant="secondary"
              isIconOnly
              className="rounded-full"
              onPress={() => router.back()}
            >
              <X size={24} color={foreground} />
            </Button>
          </ScreenHeader.Back>
          <ScreenHeader.Title>{categoryName}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}

/** A non-interactive "label — amount" row inside the balance ListGroup. */
function BalanceRow({ label, cents }: { label: string; cents: number }) {
  return (
    <ListGroup.Item disabled>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{label}</ListGroup.ItemTitle>
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <Money cents={cents} tone="plain" className="text-sm font-medium" />
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}
