import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Icon } from "@/presentation/components/atoms/Icon";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { palette } from "@/theme/colors";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
import { transferMultipleCategories, setBudgetAmount } from "@/budgets";
import { sheetForMonth, envelopeBudget } from "@/spreadsheet/bindings";
import { getSpreadsheet } from "@/spreadsheet/instance";
import { TO_BUDGET_ID } from "./cover-category-picker";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { Button } from "@/presentation/components/atoms/Button";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { SharedAmountInput } from "@/presentation/components/transaction/SharedAmountInput";
import { EditableAmountRow } from "@/presentation/components/currency-input/EditableAmountRow";
import { useSharedAmountInput } from "@/presentation/hooks/useSharedAmountInput";

type SourceEntry = {
  id: string;
  name: string;
  balance: number;
  groupName: string;
  amount: number;
};

// ---------------------------------------------------------------------------
// Source Row — display only
// ---------------------------------------------------------------------------

function SourceRow({
  source,
  isActive,
  expressionMode,
  fullExpression,
  onRemove,
  onPress,
}: {
  source: SourceEntry;
  isActive: boolean;
  expressionMode: boolean;
  fullExpression: string;
  onRemove: (id: string) => void;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  const remainingBalance = source.balance - source.amount;

  return (
    <EditableAmountRow
      label={source.name}
      amount={source.amount}
      isActive={isActive}
      expressionMode={expressionMode}
      fullExpression={fullExpression}
      onPress={onPress}
    >
      {/* Remaining pill */}
      <View
        style={{
          backgroundColor: remainingBalance >= 0 ? colors.positiveSubtle : colors.negativeSubtle,
          borderRadius: 100,
          paddingHorizontal: 8,
          paddingVertical: 2,
          marginLeft: spacing.sm,
          alignItems: "center",
        }}
      >
        <Amount
          value={remainingBalance}
          variant="captionSm"
          color={remainingBalance >= 0 ? colors.positive : colors.negative}
          weight="700"
        />
      </View>

      <Button
        icon="closeCircle"
        buttonStyle="borderless"
        color={colors.textMuted}
        onPress={() => onRemove(source.id)}
        style={{ marginLeft: spacing.xxs }}
      />
    </EditableAmountRow>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function CoverSourceScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
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

  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const activeAmount = activeSourceId
    ? (sources.find((s) => s.id === activeSourceId)?.amount ?? 0)
    : 0;

  const shared = useSharedAmountInput({
    activeAmount,
    isActive: activeSourceId !== null,
    onAmountChange: (cents) => {
      if (!activeSourceId) return;
      setSources((prev) =>
        prev.map((s) => (s.id === activeSourceId ? { ...s, amount: cents } : s)),
      );
    },
    onBlur: () => setActiveSourceId(null),
    onClear: () => {
      if (activeSourceId) {
        setSources((prev) => prev.map((s) => (s.id === activeSourceId ? { ...s, amount: 0 } : s)));
      }
    },
  });

  function handleRowPress(id: string) {
    if (activeSourceId === id) {
      shared.blur();
      return;
    }
    if (activeSourceId) shared.expr.handleBlurExpression();
    setActiveSourceId(id);
    shared.focus();
  }

  const totalCovered = sources.reduce((sum, s) => sum + s.amount, 0);
  const remaining = balanceCents - totalCovered;

  // Open picker after mount
  const [didAutoOpen, setDidAutoOpen] = useState(false);
  useEffect(() => {
    if (!didAutoOpen && sources.length === 0) {
      setDidAutoOpen(true);
      const timer = setTimeout(() => handleAddCategory(), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Pick up category from picker
  useEffect(() => {
    if (coverTarget) {
      const { catId: srcId, catName: srcName, balance: srcBalance } = coverTarget;
      setCoverTarget(null);
      if (sources.some((s) => s.id === srcId)) return;
      const defaultAmount = Math.min(Math.abs(srcBalance), Math.max(remaining, 0));
      setSources((prev) => [
        ...prev,
        { id: srcId, name: srcName, balance: srcBalance, groupName: "", amount: defaultAmount },
      ]);
    }
  }, [coverTarget]);

  function handleRemoveSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
    if (activeSourceId === id) setActiveSourceId(null);
  }

  function handleAddCategory() {
    const excludeIds = sources.map((s) => s.id).join(",");
    router.push({
      pathname: "/(auth)/budget/cover-category-picker",
      params: { excludeIds, overspentCatId: catId },
    });
  }

  async function handleCover() {
    if (!catId || saving) return;
    setSaving(true);
    try {
      const toBudgetSource = sources.find((s) => s.id === TO_BUDGET_ID && s.amount > 0);
      const categorySources = sources.filter((s) => s.id !== TO_BUDGET_ID && s.amount > 0);

      if (toBudgetSource) {
        const ss = getSpreadsheet();
        const sheet = sheetForMonth(month);
        const currentBudgeted =
          (ss.getValue(sheet, envelopeBudget.catBudgeted(catId)) as number) ?? 0;
        const newAmount = currentBudgeted + toBudgetSource.amount;
        ss.setByName(sheet, envelopeBudget.catBudgeted(catId), newAmount); // optimistic
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

      router.dismiss(2);
    } finally {
      setSaving(false);
    }
  }

  const isCovered = remaining <= 0 && sources.length > 0;
  const headerBg = isCovered ? colors.positiveFill : colors.warningFill;
  const headerText = palette.white;

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.pageBackground }}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={{ headerShown: false }} />

        {/* Header */}
        <View
          style={{
            backgroundColor: headerBg,
            paddingTop: 56,
            paddingBottom: spacing.xxxl,
            paddingHorizontal: spacing.lg,
            borderBottomLeftRadius: br.lg,
            borderBottomRightRadius: br.lg,
            alignItems: "center",
            gap: spacing.sm,
          }}
        >
          <View style={{ position: "absolute", top: 16, left: spacing.md }}>
            <GlassButton icon="close" onPress={() => router.back()} color={headerText} />
          </View>
          <Text variant="headingSm" color={headerText} align="center">
            {catName}
          </Text>
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              borderRadius: br.full,
              paddingHorizontal: 12,
              paddingVertical: 4,
            }}
          >
            <Amount value={-remaining} variant="body" color={palette.white} weight="700" />
          </View>
        </View>

        {/* Source card */}
        <View style={{ marginTop: -20, zIndex: 1, paddingHorizontal: spacing.lg }}>
          <View
            style={{
              backgroundColor: colors.cardBackground,
              borderRadius: br.lg,
              borderWidth: bw.thin,
              borderColor: colors.cardBorder,
              overflow: "hidden",
            }}
          >
            {sources.map((source, index) => (
              <View key={source.id}>
                <SourceRow
                  source={source}
                  isActive={activeSourceId === source.id}
                  expressionMode={activeSourceId === source.id && shared.expr.expressionMode}
                  fullExpression={activeSourceId === source.id ? shared.expr.fullExpression : ""}
                  onRemove={handleRemoveSource}
                  onPress={() => handleRowPress(source.id)}
                />
                <View
                  style={{
                    height: bw.thin,
                    backgroundColor: colors.divider,
                    marginHorizontal: spacing.md,
                  }}
                />
              </View>
            ))}

            <Pressable
              onPress={handleAddCategory}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: spacing.md,
                  gap: spacing.xs,
                },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Icon name="addCircle" size={20} color={colors.primary} />
              <Text variant="body" color={colors.primary} style={{ fontWeight: "600" }}>
                {sources.length === 0 ? t("addCategory") : t("addAnother")}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
          <Button
            title={saving ? t("coveringEllipsis") : t("cover")}
            loading={saving}
            disabled={totalCovered === 0}
            onPress={handleCover}
            style={{ borderRadius: br.lg }}
          />
        </View>
      </ScrollView>

      {/* Shared hidden input + toolbar */}
      <SharedAmountInput
        accessoryID={shared.accessoryID}
        sharedInputRef={shared.sharedInputRef}
        selfRef={shared.selfRef}
        value={shared.currentInputValue}
        onChangeText={shared.handleChangeText}
        onBlur={shared.handleBlur}
      />
    </>
  );
}
