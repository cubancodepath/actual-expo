import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon } from "@/presentation/components/atoms/Icon";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useBudgetStore } from "@/stores/budgetStore";
import { useUndoStore } from "@/stores/undoStore";
import { optimistic } from "@/stores/optimistic";
import { updateCategory } from "@/categories";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Amount } from "@/presentation/components/atoms/Amount";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { CircularProgress } from "@/presentation/components/atoms/CircularProgress";
import { parseGoalDef } from "@/goals";
import { describeTemplate, translateDescription } from "@/goals/describe";
import i18n from "@/i18n/config";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import type { BudgetCategory } from "@/budgets/types";
import type { ThemeColors } from "@/theme/colors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLLAPSE_THRESHOLD = 56;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthName(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return new Date(y, m - 1).toLocaleDateString(i18n.language, { month: "long" });
}

function prevMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function getPillColors(cat: BudgetCategory, colors: ThemeColors): { bg: string; text: string } {
  const hasGoal = cat.goal !== null && cat.goal > 0;
  const templates = hasGoal ? parseGoalDef(cat.goalDef) : [];
  const primaryTemplate = templates[0];
  const spentAbs = Math.abs(cat.spent);

  const isLimitGoal =
    hasGoal &&
    !!primaryTemplate &&
    (primaryTemplate.type === "limit" ||
      primaryTemplate.type === "refill" ||
      (primaryTemplate.type === "simple" &&
        primaryTemplate.monthly === 0 &&
        !!primaryTemplate.limit));

  if (isLimitGoal) {
    const ratio = spentAbs / cat.goal!;
    return {
      bg:
        ratio >= 1
          ? colors.budgetOverspentBg
          : ratio >= 0.8
            ? colors.budgetCautionBg
            : colors.budgetHealthyBg,
      text:
        ratio >= 1
          ? colors.budgetOverspent
          : ratio >= 0.8
            ? colors.budgetCaution
            : colors.budgetHealthy,
    };
  }

  if (hasGoal) {
    const funded = cat.longGoal ? cat.balance >= cat.goal! : cat.budgeted >= cat.goal!;
    return {
      bg:
        cat.balance < 0
          ? colors.budgetOverspentBg
          : funded
            ? colors.budgetHealthyBg
            : colors.budgetCautionBg,
      text:
        cat.balance < 0
          ? colors.budgetOverspent
          : funded
            ? colors.budgetHealthy
            : colors.budgetCaution,
    };
  }

  return {
    bg:
      cat.balance > 0
        ? colors.budgetHealthyBg
        : cat.balance < 0
          ? colors.budgetOverspentBg
          : colors.cardBackground,
    text:
      cat.balance > 0
        ? colors.budgetHealthy
        : cat.balance < 0
          ? colors.budgetOverspent
          : colors.textMuted,
  };
}

function getGoalChartData(
  cat: BudgetCategory,
  colors: ThemeColors,
): { progress: number; percent: number; color: string; funded: boolean } {
  if (cat.goal == null || cat.goal <= 0) {
    return { progress: 0, percent: 0, color: colors.textMuted, funded: false };
  }

  const templates = parseGoalDef(cat.goalDef);
  const primary = templates[0];
  const spentAbs = Math.abs(cat.spent);

  const isLimitGoal =
    !!primary &&
    (primary.type === "limit" ||
      primary.type === "refill" ||
      (primary.type === "simple" && primary.monthly === 0 && !!primary.limit));

  // Sinking fund (by/spend): cumulative balance vs total target amount
  const isSinkingFund =
    !!primary &&
    !isLimitGoal &&
    !cat.longGoal &&
    (primary.type === "by" || primary.type === "spend");
  const sinkingFundTotal = isSinkingFund ? Math.round(primary.amount * 100) : 0;

  if (isLimitGoal) {
    const ratio = spentAbs / cat.goal;
    const percent = Math.round(ratio * 100);
    const color = ratio >= 1 ? colors.negative : ratio >= 0.8 ? colors.warning : colors.positive;
    return { progress: Math.min(ratio, 1), percent, color, funded: ratio < 1 };
  }

  if (cat.longGoal) {
    const ratio = cat.balance / cat.goal;
    const percent = Math.round(Math.max(0, ratio) * 100);
    const funded = ratio >= 1;
    const color = cat.balance < 0 ? colors.negative : funded ? colors.positive : colors.warning;
    return {
      progress: Math.max(0, Math.min(ratio, 1)),
      percent,
      color,
      funded,
    };
  }

  if (isSinkingFund && sinkingFundTotal > 0) {
    const ratio = cat.balance / sinkingFundTotal;
    const percent = Math.round(Math.max(0, ratio) * 100);
    const funded = cat.budgeted >= cat.goal;
    const color = cat.balance < 0 ? colors.negative : funded ? colors.positive : colors.warning;
    return {
      progress: Math.max(0, Math.min(ratio, 1)),
      percent,
      color,
      funded,
    };
  }

  // Monthly goals: budgeted vs goal
  const ratio = cat.budgeted / cat.goal;
  const percent = Math.round(Math.max(0, ratio) * 100);
  const funded = ratio >= 1;
  const color = cat.balance < 0 ? colors.negative : funded ? colors.positive : colors.warning;
  return { progress: Math.max(0, Math.min(ratio, 1)), percent, color, funded };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CategoryDetailsScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const goalsEnabled = useFeatureFlag("goalTemplatesEnabled");

  // Data
  const { month, data } = useBudgetStore();
  const coverTarget = useBudgetStore((s) => s.coverTarget);
  const setCoverTarget = useBudgetStore((s) => s.setCoverTarget);
  const categories = useCategoriesStore((s) => s.categories);
  const category = categories.find((c) => c.id === categoryId);
  const budgetCat = data?.groups.flatMap((g) => g.categories).find((c) => c.id === categoryId);

  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const categoryName = category?.name ?? t("category");

  // -- Scroll-driven large title --
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Large title: fades out + slides up as you scroll (gone by 60% of threshold)
  const largeTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, COLLAPSE_THRESHOLD * 0.6], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          scrollY.value,
          [0, COLLAPSE_THRESHOLD],
          [0, -12],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  // Inline header title: fades in after large title is gone
  const headerTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [COLLAPSE_THRESHOLD * 0.6, COLLAPSE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  // Blur gradient: fades in as you scroll
  const blurContainerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 50], [0, 1], "clamp"),
  }));

  // -- Actions --

  function handleDelete() {
    if (!categoryId || deleting) return;
    Alert.alert(
      t("deleteCategoryTitle"),
      t("deleteCategoryWithTransfers", { name: category?.name ?? t("category") }),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("selectCategory"),
          onPress: () => {
            setCoverTarget(null);
            setPendingDelete(true);
            router.push({
              pathname: "/(auth)/budget/delete-category-picker",
              params: { excludeIds: categoryId, moveCatId: categoryId },
            });
          },
        },
      ],
    );
  }

  // Complete deletion after user picks a transfer category
  useEffect(() => {
    if (!pendingDelete || !coverTarget || !categoryId) return;
    (async () => {
      setDeleting(true);
      try {
        await useCategoriesStore.getState().deleteCategory(categoryId, coverTarget.catId);
        useUndoStore.getState().showUndo(t("categoryDeleted"));
        setCoverTarget(null);
        setPendingDelete(false);
        router.back();
      } catch {
        setDeleting(false);
        setPendingDelete(false);
        setCoverTarget(null);
        Alert.alert(t("errorTitle"), t("couldNotDeleteCategory"));
      }
    })();
  }, [pendingDelete, coverTarget, categoryId, setCoverTarget, router]);

  // -- Derived data --
  const currentMonth = monthName(month);
  const previousMonth = monthName(prevMonth(month));

  const templates = parseGoalDef(category?.goal_def ?? null);
  const hasGoal = goalsEnabled && templates.length > 0 && budgetCat?.goal != null;
  const goalDesc = hasGoal ? describeTemplate(templates[0], i18n.language) : null;
  const goalDescription = goalDesc ? translateDescription(goalDesc, t) : null;

  const pill = budgetCat
    ? getPillColors(budgetCat, colors)
    : { bg: colors.cardBackground, text: colors.textMuted };
  const goalChart = budgetCat ? getGoalChartData(budgetCat, colors) : null;

  const isUnderfunded =
    hasGoal &&
    budgetCat != null &&
    budgetCat.goal != null &&
    !budgetCat.longGoal &&
    budgetCat.budgeted < budgetCat.goal;

  // -- Styles --
  const cardStyle = {
    backgroundColor: colors.cardBackground,
    borderRadius: br.lg,
    borderWidth: bw.thin,
    borderColor: colors.divider,
    overflow: "hidden" as const,
  };

  const rowStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    minHeight: 44,
  };

  const dividerStyle = {
    height: bw.thin,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.lg,
  };

  const sectionLabelStyle = {
    marginBottom: spacing.xs,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      {/* ── Scrollable content ── */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: 84,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Large title ── */}
        <Animated.View style={[{ marginBottom: spacing.lg }, largeTitleStyle]}>
          <Text variant="displayLg" numberOfLines={1}>
            {categoryName}
          </Text>
        </Animated.View>

        {/* ── Balance Section ── */}
        {budgetCat && (
          <View style={[cardStyle, { marginBottom: spacing.xl }]}>
            <View style={rowStyle}>
              <Text variant="body" color={colors.textSecondary}>
                {t("fromMonth", { month: previousMonth })}
              </Text>
              <Amount
                value={budgetCat.carryIn}
                variant="body"
                weight="500"
                color={budgetCat.carryIn !== 0 ? colors.textPrimary : colors.textMuted}
              />
            </View>
            <View style={dividerStyle} />

            <View style={rowStyle}>
              <Text variant="body" color={colors.textSecondary}>
                {t("assignedForMonth", { month: currentMonth })}
              </Text>
              <Amount
                value={budgetCat.budgeted}
                variant="body"
                weight="500"
                color={budgetCat.budgeted !== 0 ? colors.textPrimary : colors.textMuted}
              />
            </View>
            <View style={dividerStyle} />

            <View style={rowStyle}>
              <Text variant="body" color={colors.textSecondary}>
                {t("activityInMonth", { month: currentMonth })}
              </Text>
              <Amount
                value={budgetCat.spent}
                variant="body"
                weight="500"
                color={budgetCat.spent !== 0 ? colors.textPrimary : colors.textMuted}
              />
            </View>

            <View
              style={{
                height: bw.thin + 1,
                backgroundColor: colors.divider,
                marginHorizontal: spacing.md,
              }}
            />
            <View style={[rowStyle, { paddingVertical: spacing.md }]}>
              <Text variant="body" style={{ fontWeight: "600" }}>
                {t("available")}
              </Text>
              <View
                style={{
                  backgroundColor: pill.bg,
                  borderRadius: 100,
                  paddingHorizontal: 14,
                  paddingVertical: 5,
                  minWidth: 64,
                  alignItems: "center",
                }}
              >
                <Amount value={budgetCat.balance} variant="body" color={pill.text} weight="700" />
              </View>
            </View>
          </View>
        )}

        {/* ── Target Section ── */}
        {goalsEnabled && (
          <>
            <Text variant="caption" color={colors.textMuted} style={sectionLabelStyle}>
              {t("target")}
            </Text>

            {hasGoal && budgetCat && goalChart ? (
              <View style={[cardStyle, { padding: spacing.lg, marginBottom: spacing.lg }]}>
                {/* Chart */}
                <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
                  <CircularProgress
                    progress={goalChart.progress}
                    color={goalChart.color}
                    size={80}
                    strokeWidth={7}
                  >
                    {goalChart.percent >= 100 ? (
                      <Icon name="checkmarkCircle" size={30} color={goalChart.color} />
                    ) : (
                      <Text
                        variant="body"
                        color={colors.textPrimary}
                        style={{ fontWeight: "700", fontSize: 16 }}
                      >
                        {goalChart.percent}%
                      </Text>
                    )}
                  </CircularProgress>
                </View>

                {/* Status: underfunded or on track */}
                {isUnderfunded && budgetCat.goal != null ? (
                  <View
                    style={{
                      backgroundColor: colors.budgetCautionBg,
                      borderRadius: br.md,
                      padding: spacing.md,
                      alignItems: "center",
                      gap: spacing.sm,
                      marginBottom: spacing.md,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        flexWrap: "wrap",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        variant="bodySm"
                        color={colors.budgetCaution}
                        style={{ fontWeight: "600" }}
                      >
                        {t("budgetToMeetGoal")}
                      </Text>
                      <Amount
                        value={budgetCat.goal - budgetCat.budgeted}
                        variant="bodySm"
                        color={colors.budgetCaution}
                        weight="600"
                      />
                      <Text
                        variant="bodySm"
                        color={colors.budgetCaution}
                        style={{ fontWeight: "600" }}
                      >
                        {t("toMeetGoal")}
                      </Text>
                    </View>
                    <Button
                      title={t("assign")}
                      size="lg"
                      style={{
                        backgroundColor: colors.budgetCaution,
                        alignSelf: "stretch",
                      }}
                      color="#000"
                      onPress={async () => {
                        const needed = budgetCat.goal! - budgetCat.budgeted;
                        if (needed > 0) {
                          await useBudgetStore
                            .getState()
                            .setAmount(budgetCat.id, budgetCat.budgeted + needed);
                        }
                      }}
                    />
                  </View>
                ) : (
                  <View
                    style={{
                      backgroundColor: colors.budgetHealthyBg,
                      borderRadius: br.md,
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      alignItems: "center",
                      marginBottom: spacing.md,
                    }}
                  >
                    <Text
                      variant="bodySm"
                      color={colors.budgetHealthy}
                      style={{ fontWeight: "600" }}
                    >
                      {t("youReachedGoal")}
                    </Text>
                  </View>
                )}

                {/* Goal description */}
                {goalDescription && (
                  <Text
                    variant="bodySm"
                    color={colors.textSecondary}
                    style={{ textAlign: "center", marginBottom: spacing.md }}
                  >
                    {goalDescription}
                  </Text>
                )}

                {/* Edit Target — full width pill */}
                <Button
                  title={t("editTarget")}
                  buttonStyle="borderedSecondary"
                  size="lg"
                  icon="flagOutline"
                  style={{ alignSelf: "stretch" }}
                  onPress={() => {
                    if (categoryId) {
                      router.navigate({
                        pathname: "/(auth)/budget/goal",
                        params: { categoryId },
                      });
                    }
                  }}
                />
              </View>
            ) : (
              <View
                style={[
                  cardStyle,
                  {
                    padding: spacing.lg,
                    alignItems: "center",
                    marginBottom: spacing.lg,
                  },
                ]}
              >
                <Icon
                  name="flagOutline"
                  size={28}
                  color={colors.textMuted}
                  style={{ marginBottom: spacing.sm }}
                />
                <Text
                  variant="body"
                  color={colors.textPrimary}
                  style={{
                    fontWeight: "600",
                    textAlign: "center",
                    marginBottom: spacing.xs,
                  }}
                >
                  {t("wantToSetGoal")}
                </Text>
                <Text
                  variant="bodySm"
                  color={colors.textSecondary}
                  style={{ textAlign: "center", marginBottom: spacing.md }}
                >
                  {t("targetsHelpPlan")}
                </Text>
                <Button
                  title={t("createTarget")}
                  size="lg"
                  style={{ alignSelf: "stretch" }}
                  onPress={() => {
                    if (categoryId) {
                      router.navigate({
                        pathname: "/(auth)/budget/goal",
                        params: { categoryId },
                      });
                    }
                  }}
                />
              </View>
            )}
          </>
        )}

        {/* ── Actions ── */}
        <View style={{ height: spacing.lg }} />
        <Button
          title={t("renameCategory")}
          buttonStyle="borderedSecondary"
          size="lg"
          icon="pencilOutline"
          style={{ alignSelf: "stretch" }}
          onPress={() => {
            if (categoryId) {
              router.navigate({
                pathname: "/(auth)/budget/rename-category",
                params: { categoryId, currentName: categoryName },
              });
            }
          }}
        />
        <View style={{ height: spacing.sm }} />
        <Button
          title={category?.hidden ? t("showCategory") : t("hideCategory")}
          buttonStyle="borderedSecondary"
          size="lg"
          icon={category?.hidden ? "eyeOutline" : "eyeOffOutline"}
          style={{ alignSelf: "stretch" }}
          onPress={() => {
            if (!categoryId) return;
            if (!category?.hidden) {
              Alert.alert(
                t("categoryHiddenTitle"),
                t("categoryHiddenMessage"),
                [
                  { text: t("cancel"), style: "cancel" },
                  {
                    text: t("hideCategory"),
                    onPress: () => {
                      optimistic(
                        useCategoriesStore,
                        (s) => ({ categories: s.categories.map((c) => (c.id === categoryId ? { ...c, hidden: true } : c)) }),
                        () => updateCategory(categoryId, { hidden: true }),
                      );
                      router.back();
                    },
                  },
                ],
              );
            } else {
              optimistic(
                useCategoriesStore,
                (s) => ({ categories: s.categories.map((c) => (c.id === categoryId ? { ...c, hidden: false } : c)) }),
                () => updateCategory(categoryId, { hidden: false }),
              );
            }
          }}
        />
        <Button
          title={t("deleteCategory")}
          buttonStyle="borderless"
          icon="trashOutline"
          danger
          onPress={handleDelete}
          disabled={deleting}
          loading={deleting}
        />
      </Animated.ScrollView>

      {/* ── Fixed top blur: fades in on scroll like Apple nav bars ── */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
          },
          blurContainerStyle,
        ]}
        pointerEvents="none"
      >
        <LinearGradient
          colors={[colors.pageBackground + "B3", colors.pageBackground + "1A", "transparent"]}
          style={{ height: 70 }}
        />
      </Animated.View>

      {/* ── Close button — Apple position ── */}
      <View
        style={{
          position: "absolute",
          top: 12,
          left: spacing.md,
          zIndex: 11,
        }}
      >
        <GlassButton icon="close" onPress={() => router.back()} />
      </View>

      {/* ── Inline title — fades in on scroll ── */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 12,
            left: 0,
            right: 0,
            height: 48,
            justifyContent: "center",
            alignItems: "center",
            zIndex: 11,
            pointerEvents: "none",
          },
          headerTitleStyle,
        ]}
      >
        <Text
          variant="body"
          color={colors.textPrimary}
          numberOfLines={1}
          style={{ fontWeight: "600", maxWidth: "70%" }}
        >
          {categoryName}
        </Text>
      </Animated.View>
    </View>
  );
}
