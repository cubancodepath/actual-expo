import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { palette } from '../../../src/theme/colors';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { transferMultipleCategories } from '../../../src/budgets';
import { TO_BUDGET_ID } from './cover-category-picker';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Amount } from '../../../src/presentation/components/atoms/Amount';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import { CompactCurrencyInput, type CompactCurrencyInputRef } from '../../../src/presentation/components/atoms/CompactCurrencyInput';
import { GlassButton } from '../../../src/presentation/components/atoms/GlassButton';
import { CalculatorToolbar } from '../../../src/presentation/components/atoms/CalculatorToolbar';
import { KeyboardToolbar } from '../../../src/presentation/components/molecules/KeyboardToolbar';

type SourceEntry = {
  id: string;
  name: string;
  balance: number;
  groupName: string;
  amount: number;
};

function SourceRow({
  source,
  onAmountChange,
  onRemove,
  onInputFocus,
}: {
  source: SourceEntry;
  onAmountChange: (id: string, cents: number) => void;
  onRemove: (id: string) => void;
  onInputFocus?: (ref: CompactCurrencyInputRef) => void;
}) {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const inputRef = useRef<CompactCurrencyInputRef>(null);
  const remainingBalance = source.balance - source.amount;

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: spacing.md,
        paddingRight: spacing.xs,
        paddingVertical: spacing.sm,
        minHeight: 48,
      }}
    >
      {/* Name */}
      <Text variant="body" color={colors.textPrimary} numberOfLines={1} style={{ flex: 1 }}>
        {source.name}
      </Text>

      {/* Amount input */}
      <CompactCurrencyInput
        ref={inputRef}
        value={source.amount}
        onChangeValue={(cents) => onAmountChange(source.id, cents)}
        onFocus={() => { if (inputRef.current) onInputFocus?.(inputRef.current); }}
      />

      {/* Remaining pill */}
      <View
        style={{
          backgroundColor: remainingBalance >= 0 ? colors.positiveSubtle : colors.negativeSubtle,
          borderRadius: 100,
          paddingHorizontal: 8,
          paddingVertical: 2,
          marginLeft: spacing.sm,
          alignItems: 'center',
        }}
      >
        <Amount
          value={remainingBalance}
          variant="captionSm"
          color={remainingBalance >= 0 ? colors.positive : colors.negative}
          weight="700"
        />
      </View>

      {/* Remove */}
      <IconButton
        sfSymbol="xmark.circle.fill"
        size={18}
        color={colors.textMuted}
        onPress={() => onRemove(source.id)}
        style={{ marginLeft: spacing.xxs }}
      />
    </Pressable>
  );
}

export default function CoverSourceScreen() {
  const { t } = useTranslation('budget');
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { catId, catName, balance } = useLocalSearchParams<{
    catId: string;
    catName: string;
    balance: string;
  }>();

  const month = useBudgetStore((s) => s.month);
  const loadBudget = useBudgetStore((s) => s.load);
  const coverTarget = useBudgetStore((s) => s.coverTarget);
  const setCoverTarget = useBudgetStore((s) => s.setCoverTarget);

  const balanceCents = Math.abs(Number(balance));
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const focusedInputRef = useRef<CompactCurrencyInputRef | null>(null);

  const totalCovered = sources.reduce((sum, s) => sum + s.amount, 0);
  const remaining = balanceCents - totalCovered;

  // Open picker after mount transition completes
  const [didAutoOpen, setDidAutoOpen] = useState(false);
  useEffect(() => {
    if (!didAutoOpen && sources.length === 0) {
      setDidAutoOpen(true);
      const timer = setTimeout(() => handleAddCategory(), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Pick up category selected from picker form sheet
  useEffect(() => {
    if (coverTarget) {
      const { catId: srcId, catName: srcName, balance: srcBalance } = coverTarget;
      setCoverTarget(null);
      if (sources.some((s) => s.id === srcId)) return;
      const defaultAmount = Math.min(Math.abs(srcBalance), Math.max(remaining, 0));
      setSources((prev) => [
        ...prev,
        { id: srcId, name: srcName, balance: srcBalance, groupName: '', amount: defaultAmount },
      ]);
    }
  }, [coverTarget]);

  function handleRemoveSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  function handleAmountChange(id: string, cents: number) {
    setSources((prev) =>
      prev.map((s) => (s.id === id ? { ...s, amount: cents } : s)),
    );
  }

  function handleAddCategory() {
    const excludeIds = sources.map((s) => s.id).join(',');
    router.push({
      pathname: '/(auth)/budget/cover-category-picker',
      params: { excludeIds, overspentCatId: catId },
    });
  }

  async function handleCover() {
    if (!catId || saving) return;
    setSaving(true);
    try {
      const toBudgetSource = sources.find((s) => s.id === TO_BUDGET_ID && s.amount > 0);
      const categorySources = sources.filter((s) => s.id !== TO_BUDGET_ID && s.amount > 0);

      // Transfer from "To Budget": increase the target category's budget
      if (toBudgetSource) {
        const data = useBudgetStore.getState().data;
        const targetCat = data?.groups
          .flatMap((g) => g.categories)
          .find((c) => c.id === catId);
        const currentBudgeted = targetCat?.budgeted ?? 0;
        await useBudgetStore.getState().setAmount(catId, currentBudgeted + toBudgetSource.amount);
      }

      // Transfer from other categories
      if (categorySources.length > 0) {
        await transferMultipleCategories(
          month,
          catId,
          categorySources.map((s) => ({ categoryId: s.id, amountCents: s.amount, name: s.name })),
          'to',
          catName,
        );
      }

      await loadBudget();
      router.dismiss(2);
    } finally {
      setSaving(false);
    }
  }

  // Header color reflects cover progress — amber → green as overspending is covered
  const isCovered = remaining <= 0 && sources.length > 0;
  const headerBg = isCovered ? colors.positiveFill : colors.warningFill;
  const headerText = palette.white;
  const amountBadgeBg = 'rgba(255,255,255,0.2)';
  const amountBadgeColor = palette.white;

  return (
    <>
    <ScrollView
      style={{ backgroundColor: colors.pageBackground }}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Health-colored header with rounded bottom corners */}
      <View
        style={{
          backgroundColor: headerBg,
          paddingTop: 56,
          paddingBottom: spacing.xxxl,
          paddingHorizontal: spacing.lg,
          borderBottomLeftRadius: br.lg,
          borderBottomRightRadius: br.lg,
          alignItems: 'center',
          gap: spacing.sm,
        }}
      >
        {/* Close button — top left */}
        <View style={{ position: 'absolute', top: 16, left: spacing.md }}>
          <GlassButton icon="xmark" onPress={() => router.back()} color={headerText} />
        </View>

        <Text variant="headingSm" color={headerText} align="center">
          {catName}
        </Text>
        <View
          style={{
            backgroundColor: amountBadgeBg,
            borderRadius: br.full,
            paddingHorizontal: 12,
            paddingVertical: 4,
          }}
        >
          <Amount
            value={-remaining}
            variant="body"
            color={amountBadgeColor}
            weight="700"
          />
        </View>
      </View>

      {/* Source card — overlaps header bottom edge */}
      <View style={{ marginTop: -20, zIndex: 1, paddingHorizontal: spacing.lg }}>
        <View
          style={{
            backgroundColor: colors.cardBackground,
            borderRadius: br.lg,
            borderWidth: bw.thin,
            borderColor: colors.cardBorder,
            overflow: 'hidden',
          }}
        >
          {sources.map((source, index) => (
            <View key={source.id}>
              <SourceRow
                source={source}
                onAmountChange={handleAmountChange}
                onRemove={handleRemoveSource}
                onInputFocus={(ref) => { focusedInputRef.current = ref; }}
              />
              {(index < sources.length - 1 || true) && (
                <View style={{ height: bw.thin, backgroundColor: colors.divider, marginHorizontal: spacing.md }} />
              )}
            </View>
          ))}

          {/* Add another */}
          <Pressable
            onPress={handleAddCategory}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: spacing.md,
                gap: spacing.xs,
              },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="add-circle" size={20} color={colors.primary} />
            <Text variant="body" color={colors.primary} style={{ fontWeight: '600' }}>
              {sources.length === 0 ? t('addCategory') : t('addAnother')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Cover button */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
        <Button
          title={saving ? t('coveringEllipsis') : t('cover')}
          variant="primary"
          loading={saving}
          disabled={totalCovered === 0}
          onPress={handleCover}
          style={{ borderRadius: br.lg }}
        />
      </View>
    </ScrollView>
    <KeyboardToolbar>
      <CalculatorToolbar
        onOperator={(op) => focusedInputRef.current?.injectOperator(op)}
        onEvaluate={() => focusedInputRef.current?.evaluate()}
      />
      <View style={{ flex: 1 }} />
      <GlassButton
        icon="checkmark"
        iconSize={16}
        variant="tinted"
        tintColor={colors.primary}
        onPress={() => Keyboard.dismiss()}
      />
    </KeyboardToolbar>
    </>
  );
}
