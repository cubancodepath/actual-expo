import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { Accordion, AccordionLayoutTransition, Button } from "heroui-native";
import { envelopeBudget, sheetForMonth } from "@/core/server/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/server/sheet";
import { resolveName } from "@/core/server/spreadsheet/util";
import { setBudgetAmount } from "@/core/server/budget/actions";
import { setGoalResult, type GoalAllocation } from "@/core/server/budget/goal-template";
import { batchMessages } from "@/core/server/sync/batch";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useBudgetMonth } from "@/screens/budget/hooks/useBudgetMonth";
import { useBudgetSections } from "@/screens/budget/hooks/useBudgetSections";
import { BudgetListSkeleton } from "@/screens/budget/components/BudgetListSkeleton";
import { AmountKeyboard, useAmountKeyboardAvoidance } from "@/ui/amount-keyboard";
import {
  ScreenHeaderBack,
  ScreenHeaderRoot,
  ScreenHeaderTitle,
} from "@/ui/ScreenHeader/ScreenHeader";
import { CloseButton } from "@/ui/CloseButton";
import { dialog } from "@/ui/feedback/dialog";
import { AssignGroup } from "./components/AssignGroup";
import { AutoAssignButton } from "./components/AutoAssignButton";
import { ProjectedToAssignBar } from "./components/ProjectedToAssignBar";
import type { PendingEdits } from "./types";
import { SurfaceCanvas, SURFACE_LEVELS } from "@/ui/surface-level";

/** Goal indicators (goal/longGoal) staged by auto-assign, written on save. */
type GoalMeta = Record<string, { goal: number | null; longGoal: boolean }>;

/**
 * Assign Money modal: the same group/category list as the budget screen but with
 * a single editable "Assigned" column. Edits are staged locally (never committed
 * per-keystroke) and written in one batch when "Save Assignments" is pressed.
 * The header pill reflects the projected to-budget including the pending deltas
 * and stays visible at 0.
 */
export function AssignMoneyScreen() {
  const router = useRouter();
  const { t } = useTranslation("budget");
  const insets = useSafeAreaInsets();
  const { month } = useBudgetMonth();
  const sheet = sheetForMonth(month);
  const { sections, isLoading } = useBudgetSections();
  // Auto-assign fills categories from their goal templates — a goals feature,
  // so it rides the parent `goalTemplatesEnabled`. Manual assigning stays core.
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");

  // Only expense groups can receive assignments (income has no assigned column).
  const groups = useMemo(() => sections.filter((s) => !s.is_income), [sections]);

  // Staged edits: catId -> { original, value }. Ref mirrors state so handlers
  // stay stable and post-stash reads (save/close) see the latest synchronously.
  const [pending, setPending] = useState<PendingEdits>({});
  const pendingRef = useRef<PendingEdits>({});
  // Goal indicators to write for categories touched by auto-assign.
  const goalMetaRef = useRef<GoalMeta>({});
  const [saving, setSaving] = useState(false);

  // Inline editing state (same mechanism as BudgetScreen), but on close/switch
  // we stash into `pending` instead of committing.
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [draft, setDraft] = useState(0);
  const [editingOriginal, setEditingOriginal] = useState(0);
  const editingRef = useRef<string | null>(null);
  const draftRef = useRef(0);
  const editingOriginalRef = useRef(0);

  const { scrollRef, scrollProps, bottomPadding, scrollIntoView, onKeyboardHeightChange } =
    useAmountKeyboardAvoidance({
      basePadding: 120,
      editingPadding: 420,
      editing: editingCatId != null,
    });

  const stash = useCallback((catId: string, cents: number) => {
    const prev = pendingRef.current;
    const original = prev[catId]?.original ?? editingOriginalRef.current;
    let next: PendingEdits;
    if (cents === original) {
      const { [catId]: _drop, ...rest } = prev;
      next = rest;
    } else {
      next = { ...prev, [catId]: { original, value: cents } };
    }
    pendingRef.current = next;
    setPending(next);
  }, []);

  const handleDraftChange = useCallback((cents: number) => {
    draftRef.current = cents;
    setDraft(cents);
  }, []);

  const onPressRow = useCallback(
    (catId: string, seed: number, pageY: number) => {
      if (editingRef.current === catId) return;
      if (editingRef.current != null) stash(editingRef.current, draftRef.current);
      const original = pendingRef.current[catId]?.original ?? seed;
      editingRef.current = catId;
      draftRef.current = seed;
      editingOriginalRef.current = original;
      setEditingCatId(catId);
      setDraft(seed);
      setEditingOriginal(original);
      scrollIntoView(pageY);
    },
    [stash, scrollIntoView],
  );

  const closeEditing = useCallback(() => {
    if (editingRef.current != null) stash(editingRef.current, draftRef.current);
    editingRef.current = null;
    setEditingCatId(null);
  }, [stash]);

  // Drop any in-progress edit and staged changes when the month changes.
  useEffect(() => {
    editingRef.current = null;
    setEditingCatId(null);
    pendingRef.current = {};
    goalMetaRef.current = {};
    setPending({});
  }, [month]);

  // The live committed budgeted amount for a category (what a row shows before
  // any staging), read straight from the spreadsheet.
  const committedFor = useCallback(
    (catId: string) => {
      const v = getSpreadsheet().getResolved(resolveName(sheet, envelopeBudget.catBudgeted(catId)));
      return typeof v === "number" ? v : 0;
    },
    [sheet],
  );

  // Stage a mode's allocations: each becomes a pending edit against the true
  // committed baseline (so the projected-to-assign math stays correct), and its
  // goal indicator is remembered for the save. An allocation equal to what's
  // committed clears any staged edit rather than showing a no-op change.
  const applyAllocations = useCallback(
    (allocations: GoalAllocation[]) => {
      const prev = pendingRef.current;
      const next: PendingEdits = { ...prev };
      const meta: GoalMeta = { ...goalMetaRef.current };
      for (const alloc of allocations) {
        const original = prev[alloc.categoryId]?.original ?? committedFor(alloc.categoryId);
        meta[alloc.categoryId] = { goal: alloc.goal, longGoal: alloc.longGoal };
        if (alloc.amount === original) {
          delete next[alloc.categoryId];
        } else {
          next[alloc.categoryId] = { original, value: alloc.amount };
        }
      }
      goalMetaRef.current = meta;
      pendingRef.current = next;
      setPending(next);
    },
    [committedFor],
  );

  // Controlled expansion: seed once (every expense group expanded).
  const [expandedIds, setExpandedIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (expandedIds === null && groups.length > 0) {
      setExpandedIds(groups.map((g) => g.id));
    }
  }, [groups, expandedIds]);

  const handleValueChange = useCallback(
    (v: string | string[] | undefined) => {
      closeEditing();
      setExpandedIds(Array.isArray(v) ? v : v ? [v] : []);
    },
    [closeEditing],
  );

  const liveToBudget = useSheetValueNumber(sheet, envelopeBudget.toBudget);
  const projected = useMemo(() => {
    let deltas = 0;
    for (const [id, p] of Object.entries(pending)) {
      if (id === editingCatId) continue;
      deltas += p.value - p.original;
    }
    if (editingCatId != null) deltas += draft - editingOriginal;
    return liveToBudget - deltas;
  }, [liveToBudget, pending, editingCatId, draft, editingOriginal]);

  const isDirty =
    Object.keys(pending).length > 0 || (editingCatId != null && draft !== editingOriginal);

  const handleSave = useCallback(async () => {
    if (editingRef.current != null) closeEditing();
    const entries = Object.entries(pendingRef.current);
    if (entries.length === 0 || saving) return;
    setSaving(true);
    try {
      const ss = getSpreadsheet();
      const goalMeta = goalMetaRef.current;
      await batchMessages(async () => {
        for (const [catId, { value }] of entries) {
          ss.setByName(sheet, envelopeBudget.catBudgeted(catId), value);
          await setBudgetAmount(month, catId, value);
        }
        // Auto-assign also sets the goal indicator, mirroring what applying a
        // budget template does on desktop.
        for (const [catId, { goal, longGoal }] of Object.entries(goalMeta)) {
          await setGoalResult(month, catId, goal, longGoal);
        }
      });
      goalMetaRef.current = {};
      router.back();
    } finally {
      setSaving(false);
    }
  }, [closeEditing, saving, sheet, month, router]);

  const handleClose = useCallback(async () => {
    closeEditing();
    if (Object.keys(pendingRef.current).length === 0) {
      router.back();
      return;
    }
    const discard = await dialog.confirm({
      title: t("discardChangesTitle"),
      message: t("discardChangesMessage"),
      confirmLabel: t("discardAction"),
      cancelLabel: t("keepEditing"),
      destructive: true,
    });
    if (discard) router.back();
  }, [closeEditing, router, t]);

  const dataReady = !isLoading || groups.length > 0;

  return (
    <SurfaceCanvas context="sheet" className="flex-1">
      <ScreenHeaderRoot>
        <ScreenHeaderBack>
          <CloseButton onPress={handleClose} />
        </ScreenHeaderBack>
        <ScreenHeaderTitle>{t("assignMoneyTitle")}</ScreenHeaderTitle>
      </ScreenHeaderRoot>

      <View className="px-4 pt-1 pb-2">
        <ProjectedToAssignBar projectedToBudget={projected} />
      </View>

      {!dataReady ? (
        <BudgetListSkeleton />
      ) : (
        <Animated.ScrollView
          ref={scrollRef}
          {...scrollProps}
          contentContainerStyle={{ paddingBottom: bottomPadding }}
          showsVerticalScrollIndicator={false}
        >
          {/* Scrolls with the list — an action above the categories, not a
              fixed control. */}
          {goalsEnabled ? (
            <View className="px-4 pb-3">
              <AutoAssignButton
                month={month}
                pending={pending}
                committedFor={committedFor}
                onApply={applyAllocations}
              />
            </View>
          ) : null}

          <Animated.View layout={AccordionLayoutTransition}>
            <Accordion
              selectionMode="multiple"
              hideSeparator
              value={expandedIds ?? []}
              onValueChange={handleValueChange}
            >
              {groups.map((group) => (
                <AssignGroup
                  key={group.id}
                  group={group}
                  sheet={sheet}
                  editingCatId={editingCatId}
                  draft={draft}
                  pending={pending}
                  onPressRow={onPressRow}
                />
              ))}
            </Accordion>
          </Animated.View>
        </Animated.ScrollView>
      )}

      {/* Rows are their own triggers, so no Trigger/Overlay — taps reach other rows. */}
      <AmountKeyboard
        isOpen={editingCatId != null}
        onClose={closeEditing}
        value={draft}
        onValueChange={handleDraftChange}
      >
        <AmountKeyboard.Portal>
          <AmountKeyboard.Panel onHeightChange={onKeyboardHeightChange} />
        </AmountKeyboard.Portal>
      </AmountKeyboard>

      {editingCatId == null && (
        // A pinned bar sitting ON the canvas — same role as AmountKeyboard's
        // panel, so it takes the `item` rung, not the canvas token.
        <View
          className={`absolute inset-x-0 bottom-0 border-t border-border px-4 pt-3 ${SURFACE_LEVELS.sheet.item}`}
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Button isDisabled={!isDirty || saving} onPress={handleSave}>
            <Button.Label>{t("saveAssignments")}</Button.Label>
          </Button>
        </View>
      )}
    </SurfaceCanvas>
  );
}
