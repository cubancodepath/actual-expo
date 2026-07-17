import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Animated from "react-native-reanimated";
import { Accordion, AccordionLayoutTransition, Button } from "heroui-native";
import { envelopeBudget, sheetForMonth } from "@/core/domain/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/domain/spreadsheet/instance";
import { setBudgetAmount } from "@/core/domain/budgets";
import { batchMessages } from "@/core/sync/batch";
import { useSheetValueNumber } from "@/hooks/useSheetValue";
import { useBudgetMonth } from "@/screens/budget/hooks/useBudgetMonth";
import { HIDDEN_GROUP_ID, useBudgetSections } from "@/screens/budget/hooks/useBudgetSections";
import { BudgetListSkeleton } from "@/screens/budget/components/BudgetListSkeleton";
import { AmountKeyboard, useAmountKeyboardAvoidance } from "@/ui/amount-keyboard";
import {
  ScreenHeaderBack,
  ScreenHeaderRoot,
  ScreenHeaderTitle,
} from "@/ui/ScreenHeader/ScreenHeader";
import { CloseButton } from "@/ui/CloseButton";
import { AssignGroup } from "./components/AssignGroup";
import { ProjectedToAssignBar } from "./components/ProjectedToAssignBar";
import type { PendingEdits } from "./types";

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

  // Only expense groups can receive assignments (income has no assigned column).
  const groups = useMemo(() => sections.filter((s) => !s.is_income), [sections]);

  // Staged edits: catId -> { original, value }. Ref mirrors state so handlers
  // stay stable and post-stash reads (save/close) see the latest synchronously.
  const [pending, setPending] = useState<PendingEdits>({});
  const pendingRef = useRef<PendingEdits>({});
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
    setPending({});
  }, [month]);

  // Controlled expansion: seed once (all expense groups expanded except hidden).
  const [expandedIds, setExpandedIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (expandedIds === null && groups.length > 0) {
      setExpandedIds(groups.filter((g) => g.id !== HIDDEN_GROUP_ID).map((g) => g.id));
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
      await batchMessages(async () => {
        for (const [catId, { value }] of entries) {
          ss.setByName(sheet, envelopeBudget.catBudgeted(catId), value);
          await setBudgetAmount(month, catId, value);
        }
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }, [closeEditing, saving, sheet, month, router]);

  const handleClose = useCallback(() => {
    closeEditing();
    if (Object.keys(pendingRef.current).length === 0) {
      router.back();
      return;
    }
    Alert.alert(t("discardChangesTitle"), t("discardChangesMessage"), [
      { text: t("keepEditing"), style: "cancel" },
      { text: t("discardAction"), style: "destructive", onPress: () => router.back() },
    ]);
  }, [closeEditing, router, t]);

  const dataReady = !isLoading || groups.length > 0;

  return (
    <View className="flex-1 bg-background">
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
        <View
          className="absolute inset-x-0 bottom-0 border-t border-border bg-background px-4 pt-3"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <Button isDisabled={!isDirty || saving} onPress={handleSave}>
            <Button.Label>{t("saveAssignments")}</Button.Label>
          </Button>
        </View>
      )}
    </View>
  );
}
