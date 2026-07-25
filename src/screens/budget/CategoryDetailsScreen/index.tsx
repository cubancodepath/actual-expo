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
import { deleteCategory, updateCategory } from "@/core/server/budget";
import { setNote } from "@/core/server/notes";
import { getCategoryNote, parseGoalDef } from "@/core/server/budget/goals";
import { describeTemplate, translateDescription } from "@/core/server/budget/goals/describe";
import { dialog } from "@/ui/feedback/dialog/dialogStore";
import { useUndo } from "@/lib/hooks/useUndo";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";

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
  const { t, i18n } = useTranslation("budget");
  const router = useRouter();
  const { showUndoNotification } = useUndo();
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
  const pickedCategory = useBudgetUIStore((s) => s.pickedCategory);
  const setPickedCategory = useBudgetUIStore((s) => s.setPickedCategory);

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
  const goalDesc = hasGoal ? describeTemplate(templates[0], i18n.language) : null;
  const goalDescription = goalDesc ? translateDescription(goalDesc, t) : null;

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

  // ── Delete flow: confirm → pick a transfer target → deleteCategory ──
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (deleting) return;
    const ok = await dialog.confirm({
      title: t("deleteCategoryTitle"),
      message: t("deleteCategoryWithTransfers", { name: categoryName }),
      confirmLabel: t("selectCategory"),
      destructive: true,
    });
    if (!ok) return;
    setPickedCategory(null);
    setPendingDelete(true);
    router.push({
      pathname: "/(auth)/budget/delete-category-picker",
      params: { excludeIds: categoryId, moveCatId: categoryId },
    });
  }

  useEffect(() => {
    if (!pendingDelete || !pickedCategory) return;
    (async () => {
      setDeleting(true);
      try {
        await deleteCategory(categoryId, pickedCategory.catId);
        showUndoNotification(t("categoryDeleted"));
        setPickedCategory(null);
        setPendingDelete(false);
        router.back();
      } catch (e) {
        emitErrorEvent(e);
        setDeleting(false);
        setPendingDelete(false);
        setPickedCategory(null);
        await dialog.alert({ title: t("errorTitle"), message: t("couldNotDeleteCategory") });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDelete, pickedCategory, categoryId]);

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
        <ListGroup className="mb-6">
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
            <Surface className="items-center gap-3 rounded-2xl p-4">
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
            isDisabled={deleting}
            onPress={handleDelete}
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
