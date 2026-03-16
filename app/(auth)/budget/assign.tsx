import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Keyboard, Pressable, SectionList, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { useBudgetStore } from "../../../src/stores/budgetStore";
import { Text } from "../../../src/presentation/components/atoms/Text";
import { IconButton } from "../../../src/presentation/components/atoms/IconButton";
import { Button } from "../../../src/presentation/components/atoms/Button";
import {
  CompactCurrencyInput,
  type CompactCurrencyInputRef,
} from "../../../src/presentation/components/atoms/CompactCurrencyInput";
import { CalculatorToolbar } from "../../../src/presentation/components/atoms/CalculatorToolbar";
import { KeyboardToolbar } from "../../../src/presentation/components/molecules/KeyboardToolbar";
import { GlassButton } from "../../../src/presentation/components/atoms/GlassButton";
import { Amount } from "../../../src/presentation/components/atoms/Amount";

import { getGoalProgress } from "../../../src/goals/progress";
import { useFeatureFlag } from "../../../src/hooks/useFeatureFlag";
import type { BudgetCategory } from "../../../src/budgets/types";

type CategorySection = {
  key: string;
  title: string;
  data: BudgetCategory[];
};

export default function AssignBudgetScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, setAmount } = useBudgetStore();

  const toBudget = data?.toBudget ?? 0;
  const buffered = data?.buffered ?? 0;
  const groups = data?.groups ?? [];

  // Local edits: categoryId → cents
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const hapticFiredRef = useRef(false);
  const focusedInputRef = useRef<CompactCurrencyInputRef | null>(null);

  // Initialize edits from current budget data (re-run when groups change, e.g. month switch)
  useEffect(() => {
    Keyboard.dismiss(); // Clear focus so no input holds stale values
    const initial: Record<string, number> = {};
    for (const g of groups) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        initial[cat.id] = cat.budgeted;
      }
    }
    setEdits(initial);
  }, [groups]);

  // Sections for expense groups only — pass full BudgetCategory
  const sections = useMemo<CategorySection[]>(
    () =>
      groups
        .filter((g) => !g.is_income)
        .map((g) => ({
          key: g.id,
          title: g.name,
          data: g.categories,
        })),
    [groups],
  );

  // Sum of all edited amounts in cents
  const totalAssigned = useMemo(() => {
    let sum = 0;
    for (const val of Object.values(edits)) {
      sum += val;
    }
    return sum;
  }, [edits]);

  // Original total budgeted (to compute delta)
  const originalBudgeted = useMemo(() => {
    let sum = 0;
    for (const g of groups) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        sum += cat.budgeted;
      }
    }
    return sum;
  }, [groups]);

  const remaining = toBudget - (totalAssigned - originalBudgeted);

  // Underfunded: sum of (goal - funded) for all categories with goals where not fully funded
  const underfunded = useMemo(() => {
    if (!goalsEnabled) return 0;
    let sum = 0;
    for (const g of groups) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        if (cat.goal == null || cat.goal <= 0) continue;
        if (cat.longGoal) continue;
        const editedBudgeted = edits[cat.id] ?? cat.budgeted;
        const funded = cat.longGoal
          ? cat.balance + (editedBudgeted - cat.budgeted)
          : editedBudgeted;
        const needed = cat.goal - funded;
        if (needed > 0) sum += needed;
      }
    }
    return sum;
  }, [groups, edits, goalsEnabled]);

  // Check if any category has been changed
  const hasChanges = useMemo(() => {
    for (const g of groups) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        if ((edits[cat.id] ?? 0) !== cat.budgeted) return true;
      }
    }
    return false;
  }, [edits, groups]);

  // Haptic when fully assigned
  useEffect(() => {
    if (remaining === 0 && hasChanges && !hapticFiredRef.current) {
      hapticFiredRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (remaining !== 0) {
      hapticFiredRef.current = false;
    }
  }, [remaining, hasChanges]);

  function updateEdit(catId: string, cents: number) {
    setEdits((prev) => ({ ...prev, [catId]: cents }));
  }

  async function handleAutoAssign() {
    Keyboard.dismiss();
    setSaving(true);
    try {
      // Dry run: compute allocations without writing to DB
      const result = await useBudgetStore.getState().computeGoals(false);
      // Merge computed allocations into local edits
      setEdits((prev) => {
        const next = { ...prev };
        for (const [catId, alloc] of result.allocations) {
          next[catId] = alloc.amount;
        }
        return next;
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result.applied === 0) {
        Alert.alert(t("noChangesTitle"), t("noChangesMessage"));
      }
    } catch {
      Alert.alert(t("errorTitle"), t("autoAssignError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    for (const g of groups) {
      if (g.is_income) continue;
      for (const cat of g.categories) {
        const newCents = edits[cat.id] ?? 0;
        if (newCents !== cat.budgeted) {
          await setAmount(cat.id, newCents);
        }
      }
    }
    router.back();
  }

  // ── Color state — matches ReadyToAssignPill ──
  const isPositive = remaining > 0;
  const isNegative = remaining < 0;

  const statusColor = isPositive
    ? colors.budgetHealthy
    : isNegative
      ? colors.budgetOverspent
      : colors.textMuted;

  const cardBg = isPositive
    ? colors.budgetHealthyBg
    : isNegative
      ? colors.budgetOverspentBg
      : colors.cardBackground;

  const statusLabel = isPositive
    ? t("readyToAssign")
    : isNegative
      ? t("overassigned")
      : t("fullyAssigned");

  const labelStyle = {
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
    fontWeight: "700" as const,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              sfSymbol="xmark"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
        }}
      />

      {/* Summary Card — fixed above the list */}
      <View
        style={{
          marginHorizontal: spacing.lg,
          marginTop: spacing.lg,
          marginBottom: spacing.sm,
          backgroundColor: cardBg,
          borderRadius: br.lg,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          alignItems: "center",
        }}
      >
        <Amount value={remaining} variant="headingLg" color={statusColor} weight="700" />
        <Text variant="captionSm" color={statusColor} style={{ fontWeight: "500", marginTop: 2 }}>
          {statusLabel}
        </Text>
        {underfunded > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
            <Amount value={underfunded} variant="captionSm" color={statusColor} weight="600" />
            <Text variant="captionSm" color={statusColor} style={{ opacity: 0.7 }}>
              {t("toFullyFundGoals")}
            </Text>
          </View>
        )}
      </View>

      {/* Quick Actions — fixed */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          gap: spacing.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          <Button
            title={t("reserve")}
            icon="calendar-outline"
            variant="secondary"
            size="sm"
            onPress={() => {
              Keyboard.dismiss();
              router.push({
                pathname: "/(auth)/budget/hold",
                params: { current: String(buffered), maxAmount: String(remaining + buffered) },
              });
            }}
            style={{ borderRadius: br.full }}
          />
        </View>
        {goalsEnabled && (
          <View style={{ flex: 1 }}>
            <Button
              title={t("autoAssign")}
              icon="sparkles"
              variant="primary"
              size="sm"
              onPress={() => handleAutoAssign()}
              style={{ borderRadius: br.full }}
            />
          </View>
        )}
      </View>

      <SectionList
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        stickySectionHeadersEnabled
        keyboardDismissMode="on-drag"
        renderSectionHeader={({ section }) => (
          <View
            style={{
              paddingHorizontal: spacing.lg * 2,
              paddingTop: spacing.lg,
              paddingBottom: spacing.xs,
              backgroundColor: colors.pageBackground,
            }}
          >
            <Text variant="captionSm" color={colors.textMuted} style={labelStyle}>
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item: cat, index, section }) => {
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          const editedValue = edits[cat.id] ?? cat.budgeted;
          const isEdited = editedValue !== cat.budgeted;
          return (
            <CategoryAmountRow
              cat={cat}
              value={editedValue}
              onChange={updateEdit}
              onInputFocus={(ref) => {
                focusedInputRef.current = ref;
              }}
              isFirst={isFirst}
              isLast={isLast}
              isEdited={isEdited}
            />
          );
        }}
        contentContainerStyle={{ paddingBottom: hasChanges ? 200 : 120 }}
        scrollIndicatorInsets={{ bottom: 120 }}
      />

      <KeyboardToolbar>
        <CalculatorToolbar
          onOperator={(op) => focusedInputRef.current?.injectOperator(op)}
          onEvaluate={() => focusedInputRef.current?.evaluate()}
        />
        <View style={{ flex: 1 }} />
        <GlassButton icon="checkmark" iconSize={18} onPress={() => Keyboard.dismiss()} />
      </KeyboardToolbar>

      {/* Save button — fixed at bottom */}
      {hasChanges && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.md),
            backgroundColor: colors.pageBackground,
            borderTopWidth: bw.thin,
            borderTopColor: colors.divider,
          }}
        >
          <Button
            title={saving ? t("savingEllipsis") : t("saveAssignment")}
            icon="checkmark"
            variant="primary"
            size="lg"
            loading={saving}
            onPress={handleSave}
            style={{ borderRadius: br.full }}
          />
        </View>
      )}
    </View>
  );
}

// ── Category row with goal progress bar ─────────────────────────────────────

function CategoryAmountRow({
  cat,
  value,
  onChange,
  onInputFocus,
  isFirst,
  isLast,
  isEdited,
}: {
  cat: BudgetCategory;
  value: number;
  onChange: (catId: string, cents: number) => void;
  onInputFocus?: (ref: CompactCurrencyInputRef) => void;
  isFirst: boolean;
  isLast: boolean;
  isEdited: boolean;
}) {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");
  const inputRef = useRef<CompactCurrencyInputRef>(null);

  const hasGoal = goalsEnabled && cat.goal != null && cat.goal > 0;

  // Progress bar: funded ratio based on edited value
  let progressPct = 0;
  if (hasGoal) {
    const funded = cat.longGoal ? cat.balance + (value - cat.budgeted) : value;
    progressPct = Math.min(Math.max(funded / cat.goal!, 0), 1);
  } else if (value > 0) {
    const spentAbs = Math.abs(cat.spent);
    progressPct = Math.min(spentAbs / value, 1);
  }

  const barColor = isEdited ? colors.primary : colors.textMuted;

  // Build a virtual BudgetCategory reflecting the edited budgeted value for goal text
  const editedCat: BudgetCategory = useMemo(
    () => ({
      ...cat,
      budgeted: value,
      balance: cat.balance + (value - cat.budgeted),
    }),
    [cat, value],
  );

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={{
        paddingHorizontal: spacing.lg,
        paddingTop: 12,
        paddingBottom: 10,
        minHeight: 44,
        marginHorizontal: spacing.lg,
        backgroundColor: colors.cardBackground,
        borderTopLeftRadius: isFirst ? br.lg : 0,
        borderTopRightRadius: isFirst ? br.lg : 0,
        borderBottomLeftRadius: isLast ? br.lg : 0,
        borderBottomRightRadius: isLast ? br.lg : 0,
      }}
    >
      {/* Line 1: Name + Input */}
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
          {cat.name}
        </Text>
        <CompactCurrencyInput
          ref={inputRef}
          value={value}
          onChangeValue={(cents) => onChange(cat.id, cents)}
          onFocus={() => {
            if (inputRef.current) onInputFocus?.(inputRef.current);
          }}
        />
      </View>

      {/* Line 2: Progress bar */}
      {goalsEnabled && (
        <View
          style={{
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.divider,
            marginTop: 6,
            overflow: "hidden",
          }}
        >
          {progressPct > 0 && (
            <View
              style={{
                width: `${Math.round(progressPct * 100)}%`,
                height: "100%",
                borderRadius: 4,
                backgroundColor: barColor,
              }}
            />
          )}
        </View>
      )}

      {/* Line 3: Goal progress text */}
      {goalsEnabled && (
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 3 }}
        >
          {getGoalProgress(editedCat).map((seg, i) =>
            "key" in seg ? (
              <Text key={i} variant="captionSm" color={colors.textMuted}>
                {t(seg.key as any)}
              </Text>
            ) : (
              <Amount
                key={i}
                value={seg.amount}
                variant="captionSm"
                color={colors.textMuted}
                colored={false}
              />
            ),
          )}
        </View>
      )}

      {/* Inset divider */}
      {!isLast && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: spacing.lg,
            right: spacing.lg,
            height: bw.thin,
            backgroundColor: colors.divider,
          }}
        />
      )}
    </Pressable>
  );
}
