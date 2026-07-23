import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Animated from "react-native-reanimated";
import { Accordion, AccordionLayoutTransition, Menu } from "heroui-native";
import { envelopeBudget, sheetForMonth } from "@/core/server/spreadsheet/bindings";
import { getSpreadsheet } from "@/core/server/spreadsheet/globals";
import { resetHold, setBudgetAmount, setCategoryCarryover } from "@/core/domain/budgets";
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
import { noop } from "@/screens/budget/constants";
import { BudgetCategoryRow } from "./components/BudgetCategoryRow";
import { IncomeCategoryRow } from "./components/IncomeCategoryRow";
import { BudgetGroup } from "./components/BudgetGroup";
import { CategoryRowMenu, type RowRect } from "./components/CategoryRowMenu";
import { IncomeRowMenu } from "./components/IncomeRowMenu";
import { OverspentPill } from "./components/OverspentPill";
import { ReadyToAssignBar } from "./components/ReadyToAssignBar";

/** The long-pressed row the category menu is currently open on. */
interface MenuTarget {
  catId: string;
  catName: string;
  balance: number;
  carryover: boolean;
  /** Income rows get the auto-hold menu; expense rows the full category menu. */
  isIncome: boolean;
  /** The row's window frame, measured at long-press. */
  rect: RowRect;
}

export function BudgetScreen() {
  const router = useRouter();
  const { month } = useBudgetMonth();
  const sheet = sheetForMonth(month);
  const { sections, isLoading } = useBudgetSections();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  // The structured goal editor is the `goalTemplatesUIEnabled` sub-feature; the
  // chips/progress display stays under the parent `goalsEnabled`.
  const goalEditorEnabled = useFeatureFlag("goalTemplatesUIEnabled");
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

  // Discard the in-progress edit without committing — used when another
  // interaction (e.g. a row's long-press menu) takes over the screen.
  const cancelEditing = useCallback(() => {
    editingRef.current = null;
    setEditingCatId(null);
    setTabBarHidden(false);
  }, [setTabBarHidden]);

  // The category menu lives here rather than in each row: one Menu instance for
  // the whole list instead of one per row (each carries shared values, a
  // controllable-state hook and native views, and the list isn't virtualised).
  // `menuTarget` names the long-pressed row and its measured frame; the menu
  // anchors to that frame through a phantom trigger, and the row hides itself
  // once the floating preview is up (`isPreviewShown`), so there's no blink.
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  const [isPreviewShown, setPreviewShown] = useState(false);

  const onLongPressRow = useCallback(
    (
      catId: string,
      catName: string,
      balance: number,
      carryover: boolean,
      rect: RowRect,
      isIncome = false,
    ) => {
      cancelEditing(); // an in-progress amount edit is dropped, not committed
      setPreviewShown(false);
      setMenuTarget({ catId, catName, balance, carryover, isIncome, rect });
    },
    [cancelEditing],
  );

  // Toggle overspending rollover: optimistic cell write for the instant arrow,
  // CRDT behind (like commit) — sync.ts recomputes the carried balances when
  // the zero_budgets messages apply.
  const toggleCarryover = useCallback(
    (catId: string, next: boolean) => {
      getSpreadsheet().setByName(sheet, envelopeBudget.catCarryover(catId), next);
      setCategoryCarryover(month, catId, next).catch((err) => {
        emitErrorEvent(err instanceof Error ? err : new Error(String(err)));
      });
    },
    [sheet, month],
  );

  // Auto hold = income carryover. Same optimistic-cell + CRDT pattern as
  // toggleCarryover, but enabling it releases any manual hold first so the two
  // mechanisms never stack on the same month (desktop parity).
  const toggleAutoHold = useCallback(
    (catId: string, next: boolean) => {
      if (next) resetHold(month).catch(() => {});
      getSpreadsheet().setByName(sheet, envelopeBudget.catCarryover(catId), next);
      setCategoryCarryover(month, catId, next).catch((err) => {
        emitErrorEvent(err instanceof Error ? err : new Error(String(err)));
      });
    },
    [sheet, month],
  );

  const closeMenu = useCallback(() => {
    setMenuTarget(null);
    setPreviewShown(false);
  }, []);

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
          month={month}
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
                  onLongPressRow={onLongPressRow}
                  liftedCatId={isPreviewShown ? (menuTarget?.catId ?? null) : null}
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

      {/* One menu for the whole list, mounted only while a row is long-pressed.
          `isDefaultOpen` makes it measure its trigger and open on mount, so the
          menu is laid over the pressed row's frame and its trigger fills it —
          the popover anchors to the row without every row having to own a Menu.
          The frame and the trigger's own measure are both page coordinates, and
          this screen's root sits at the page origin, so the two agree. */}
      {menuTarget && (
        <Menu
          isDefaultOpen
          onOpenChange={(open) => {
            if (!open) closeMenu();
          }}
          pointerEvents="none" // purely a measuring anchor; never takes touches
          style={{
            position: "absolute",
            left: menuTarget.rect.x,
            top: menuTarget.rect.y,
            width: menuTarget.rect.width,
            height: menuTarget.rect.height,
          }}
        >
          <Menu.Trigger pointerEvents="none" style={StyleSheet.absoluteFill} />
          {menuTarget.isIncome ? (
            <IncomeRowMenu
              rect={menuTarget.rect}
              onPreviewLayout={() => setPreviewShown(true)}
              carryover={menuTarget.carryover}
              onToggleAutoHold={() => toggleAutoHold(menuTarget.catId, !menuTarget.carryover)}
              onViewActivity={() =>
                router.push({
                  pathname: "/(auth)/budget/category-transactions",
                  params: { categoryId: menuTarget.catId, categoryName: menuTarget.catName, month },
                })
              }
              preview={
                <IncomeCategoryRow
                  catId={menuTarget.catId}
                  catName={menuTarget.catName}
                  sheet={sheet}
                  onLongPressRow={noop}
                />
              }
            />
          ) : (
            <CategoryRowMenu
              rect={menuTarget.rect}
              onPreviewLayout={() => setPreviewShown(true)}
              // The form seeds from these params; the name goes along because,
              // unlike accountName, it isn't looked up from the id.
              onAddTransaction={() =>
                router.push({
                  pathname: "/(auth)/transaction/new",
                  params: { categoryId: menuTarget.catId, categoryName: menuTarget.catName },
                })
              }
              onViewActivity={() =>
                router.push({
                  pathname: "/(auth)/budget/category-transactions",
                  params: { categoryId: menuTarget.catId, categoryName: menuTarget.catName, month },
                })
              }
              onMoveMoney={() =>
                router.push({
                  pathname: "/(auth)/budget/move-money",
                  params: {
                    catId: menuTarget.catId,
                    catName: menuTarget.catName,
                    balance: String(menuTarget.balance),
                  },
                })
              }
              onEditGoals={
                goalEditorEnabled
                  ? () =>
                      router.push({
                        pathname: "/(auth)/budget/goal",
                        params: { categoryId: menuTarget.catId },
                      })
                  : undefined
              }
              carryover={menuTarget.carryover}
              onToggleCarryover={() => toggleCarryover(menuTarget.catId, !menuTarget.carryover)}
              onViewDetails={() =>
                router.push({
                  pathname: "/(auth)/budget/category-details",
                  params: { categoryId: menuTarget.catId },
                })
              }
              preview={
                <BudgetCategoryRow
                  catId={menuTarget.catId}
                  catName={menuTarget.catName}
                  sheet={sheet}
                  isEditing={false}
                  draft={0}
                  onPressRow={noop}
                  onLongPressRow={noop}
                  goalsEnabled={goalsEnabled}
                />
              }
            />
          )}
        </Menu>
      )}

      {editingCatId == null && <AddTransactionFab />}
    </View>
  );
}
