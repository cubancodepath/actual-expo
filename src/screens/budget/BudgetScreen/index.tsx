import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import { Accordion, AccordionLayoutTransition } from "heroui-native";
import { envelopeBudget, sheetForMonth } from "@/core/domain/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/domain/spreadsheet/instance";
import { setBudgetAmount } from "@/core/domain/budgets";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { useBudgetMonth } from "@/screens/budget/hooks/useBudgetMonth";
import { HIDDEN_GROUP_ID, useBudgetSections } from "@/screens/budget/hooks/useBudgetSections";
import { BudgetHeader } from "@/screens/budget/components/BudgetHeader";
import { BudgetListSkeleton } from "@/screens/budget/components/BudgetListSkeleton";
import { AddTransactionFab } from "@/ui/AddTransactionFab";
import { AmountKeyboard, useAmountKeyboardAvoidance } from "@/ui/amount-keyboard";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useTabBarStore } from "@/stores/tabBarStore";
import { useOverspentCount } from "@/screens/budget/hooks/useOverspentCount";
import { BudgetGroup } from "./components/BudgetGroup";
import { OverspentPill } from "./components/OverspentPill";
import { ReadyToAssignBar } from "./components/ReadyToAssignBar";

export function BudgetScreen() {
  const router = useRouter();
  const { month } = useBudgetMonth();
  const sheet = sheetForMonth(month);
  const { sections, isLoading } = useBudgetSections();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const overspentCount = useOverspentCount(sheet);

  // Persist an edited assigned amount: update the spreadsheet for instant UI,
  // then setBudgetAmount for the CRDT/undoable write.
  const commit = useCallback(
    (catId: string, cents: number) => {
      getSpreadsheet().setByName(sheet, envelopeBudget.catBudgeted(catId), cents);
      setBudgetAmount(month, catId, cents).catch((err) => {
        // The optimistic cell now lies — surface the failure; the next
        // spreadsheet recompute from DB will restore the real value.
        emitErrorEvent(err instanceof Error ? err : new Error(String(err)));
      });
    },
    [sheet, month],
  );

  // Inline editing of the assigned amount. Refs mirror state so the handlers stay
  // stable (rows keep their memo across edits) while still committing the latest.
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [draft, setDraft] = useState(0);
  const editingRef = useRef<string | null>(null);
  const draftRef = useRef(0);
  const setHidden = useTabBarStore((s) => s.setHidden);
  // iOS never hides the tab bar: the keyboard renders in a FullWindowOverlay and
  // simply covers it (hiding native tabs resizes the screen mid-animation).
  // Android's FloatingTabBar is absolute, so hiding it is a pure visual toggle.
  const setTabBarHidden = useCallback(
    (hidden: boolean) => {
      if (Platform.OS === "android") setHidden(hidden);
    },
    [setHidden],
  );

  const { scrollRef, scrollProps, bottomPadding, scrollIntoView, onKeyboardHeightChange } =
    useAmountKeyboardAvoidance({
      basePadding: 140,
      editingPadding: 420,
      editing: editingCatId != null,
    });

  const handleDraftChange = useCallback((cents: number) => {
    draftRef.current = cents;
    setDraft(cents);
  }, []);

  const onPressRow = useCallback(
    (catId: string, budgeted: number, pageY: number) => {
      if (editingRef.current === catId) return;
      if (editingRef.current != null) commit(editingRef.current, draftRef.current);
      editingRef.current = catId;
      draftRef.current = budgeted;
      setEditingCatId(catId);
      setDraft(budgeted);
      setTabBarHidden(true);
      scrollIntoView(pageY);
    },
    [commit, setTabBarHidden, scrollIntoView],
  );

  const closeEditing = useCallback(() => {
    if (editingRef.current != null) commit(editingRef.current, draftRef.current);
    editingRef.current = null;
    setEditingCatId(null);
    setTabBarHidden(false);
  }, [commit, setTabBarHidden]);

  // Drop any in-progress edit when the month changes (values belong to a month),
  // and never leave the tab bar hidden when unmounting mid-edit.
  useEffect(() => {
    editingRef.current = null;
    setEditingCatId(null);
    setTabBarHidden(false);
  }, [month, setTabBarHidden]);
  useEffect(() => () => setTabBarHidden(false), [setTabBarHidden]);

  // Controlled expansion: seed once (all groups expanded except hidden) the
  // first time sections arrive; after that the user drives it.
  const [expandedIds, setExpandedIds] = useState<string[] | null>(null);
  useEffect(() => {
    if (expandedIds === null && sections.length > 0) {
      setExpandedIds(sections.filter((s) => s.id !== HIDDEN_GROUP_ID).map((s) => s.id));
    }
  }, [sections, expandedIds]);

  const handleValueChange = useCallback(
    (v: string | string[] | undefined) => {
      closeEditing();
      setExpandedIds(Array.isArray(v) ? v : v ? [v] : []);
    },
    [closeEditing],
  );

  const dataReady = !isLoading || sections.length > 0;

  return (
    <View className="flex-1 bg-background">
      <BudgetHeader />

      <View className="px-4 pt-1 pb-2">
        <ReadyToAssignBar
          sheet={sheet}
          onPress={() => router.push("/(auth)/budget/assign-money")}
        />
      </View>
      {/* TODO: uncategorized / overspent summary (next step) */}

      {!dataReady ? (
        <BudgetListSkeleton />
      ) : (
        <Animated.ScrollView
          ref={scrollRef}
          {...scrollProps}
          contentContainerStyle={{ paddingBottom: bottomPadding }}
          showsVerticalScrollIndicator={false}
        >
          {overspentCount > 0 && (
            <View className="px-4 pb-3">
              <OverspentPill
                count={overspentCount}
                onPress={() => router.push("/(auth)/budget/cover-overspent")}
              />
            </View>
          )}

          {/* The accordion layout transition lives on an inner wrapper — NOT on
              the ScrollView — so frame changes apply instantly instead of springing. */}
          <Animated.View layout={AccordionLayoutTransition}>
            <Accordion
              selectionMode="multiple"
              hideSeparator
              value={expandedIds ?? []}
              onValueChange={handleValueChange}
            >
              {sections.map((group) => (
                <BudgetGroup
                  key={group.id}
                  group={group}
                  sheet={sheet}
                  editingCatId={editingCatId}
                  draft={draft}
                  onPressRow={onPressRow}
                  goalsEnabled={goalsEnabled}
                />
              ))}
            </Accordion>
          </Animated.View>
        </Animated.ScrollView>
      )}

      {/* Multi-field screen: rows are their own triggers (seed/switch), so no
          Trigger and no Overlay — taps must reach the other rows. */}
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

      {editingCatId == null && <AddTransactionFab />}
    </View>
  );
}
