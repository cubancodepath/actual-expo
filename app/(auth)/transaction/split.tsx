import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { usePickerStore, type SplitLine } from '../../../src/stores/pickerStore';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { useKeyboardHeight } from '../../../src/presentation/hooks/useKeyboardHeight';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Amount } from '../../../src/presentation/components/atoms/Amount';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import {
  CompactCurrencyInput,
  type CompactCurrencyInputRef,
} from '../../../src/presentation/components/atoms/CompactCurrencyInput';
import { formatAmount } from '../../../src/lib/format';
import type { Theme } from '../../../src/theme';

// ---------------------------------------------------------------------------
// Split Line Row
// ---------------------------------------------------------------------------

function SplitRow({
  line,
  onAmountChange,
  onCategoryPress,
  onRemove,
  onFocus,
  inputRef,
}: {
  line: SplitLine;
  onAmountChange: (id: string, cents: number) => void;
  onCategoryPress: (id: string) => void;
  onRemove: (id: string) => void;
  onFocus: (id: string) => void;
  inputRef: React.RefObject<CompactCurrencyInputRef | null>;
}) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: spacing.md,
        paddingRight: spacing.xs,
        paddingVertical: spacing.sm,
        minHeight: 48,
      }}
    >
      <Pressable
        onPress={() => onCategoryPress(line.id)}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
      >
        <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} style={{ marginRight: spacing.xs }} />
        <Text
          variant="body"
          color={line.categoryName ? colors.textPrimary : colors.textMuted}
          numberOfLines={1}
          style={{ flex: 1 }}
        >
          {line.categoryName || 'Select category'}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ marginRight: spacing.sm }} />
      </Pressable>

      <Pressable onPress={() => inputRef.current?.focus()}>
        <CompactCurrencyInput
          ref={inputRef}
          value={line.amount}
          onChangeValue={(cents) => onAmountChange(line.id, cents)}
          onFocus={() => onFocus(line.id)}
        />
      </Pressable>

      <IconButton
        icon="close-circle"
        size={18}
        color={colors.textMuted}
        onPress={() => onRemove(line.id)}
        style={{ marginLeft: spacing.xxs }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function SplitScreen() {
  const { amount, payeeName, payeeId, transactionId, fromCategoryPicker } = useLocalSearchParams<{
    amount: string;
    payeeName?: string;
    payeeId?: string;
    transactionId?: string;
    fromCategoryPicker?: string;
  }>();

  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { height: keyboardHeight, visible: keyboardVisible } = useKeyboardHeight();
  const fabStyle = useAnimatedStyle(() => ({ bottom: keyboardHeight.value }));

  const setSplitCategories = usePickerStore((s) => s.setSplitCategories);
  const existingSplit = usePickerStore((s) => s.splitCategories);
  const splitCategorySelection = usePickerStore((s) => s.splitCategorySelection);
  const clearSplitCategorySelection = usePickerStore((s) => s.setSplitCategorySelection);

  const totalCents = Number(amount) || 0;

  const [splits, setSplits] = useState<SplitLine[]>(() => {
    if (existingSplit && existingSplit.length > 0) return existingSplit;
    return [
      { id: randomUUID(), categoryId: null, categoryName: '', amount: 0 },
    ];
  });

  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  // Keep refs for each split line input
  const inputRefs = useRef<Map<string, React.RefObject<CompactCurrencyInputRef | null>>>(new Map());
  function getInputRef(id: string) {
    if (!inputRefs.current.has(id)) {
      inputRefs.current.set(id, { current: null });
    }
    return inputRefs.current.get(id)!;
  }

  // Pick up category selection from split-category-picker
  useEffect(() => {
    if (splitCategorySelection) {
      const { lineId, categoryId, categoryName } = splitCategorySelection;
      clearSplitCategorySelection(null);
      setSplits((prev) =>
        prev.map((s) => (s.id === lineId ? { ...s, categoryId, categoryName } : s)),
      );
    }
  }, [splitCategorySelection]);

  const totalAllocated = splits.reduce((sum, s) => sum + s.amount, 0);
  const remaining = totalCents - totalAllocated;

  function handleAmountChange(id: string, cents: number) {
    setSplits((prev) =>
      prev.map((s) => (s.id === id ? { ...s, amount: cents } : s)),
    );
  }

  function handleCategoryPress(lineId: string) {
    const line = splits.find((s) => s.id === lineId);
    router.push({
      pathname: './split-category-picker',
      params: {
        splitLineId: lineId,
        selectedId: line?.categoryId ?? '',
      },
    });
  }

  function handleRemove(id: string) {
    setSplits((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      return filtered.length === 0
        ? [{ id: randomUUID(), categoryId: null, categoryName: '', amount: 0 }]
        : filtered;
    });
    if (activeLineId === id) setActiveLineId(null);
  }

  function handleAdd() {
    setSplits((prev) => [
      ...prev,
      { id: randomUUID(), categoryId: null, categoryName: '', amount: 0 },
    ]);
  }

  function handleAssignRemaining() {
    if (!activeLineId || remaining <= 0) return;
    setSplits((prev) =>
      prev.map((s) =>
        s.id === activeLineId ? { ...s, amount: s.amount + remaining } : s,
      ),
    );
    Keyboard.dismiss();
  }

  function handleDone() {
    // If there was a preset amount, splits must match it
    if (totalCents > 0 && remaining !== 0) {
      Alert.alert(
        'Amounts don\u2019t match',
        `The split amounts must equal the transaction total. ${formatAmount(Math.abs(remaining))} remaining.`,
      );
      return;
    }

    const validSplits = splits.filter((s) => s.amount > 0);
    if (validSplits.length === 0) {
      Alert.alert('No splits', 'Add at least one split with an amount.');
      return;
    }

    setSplitCategories(validSplits);
    router.dismiss(fromCategoryPicker === '1' ? 2 : 1);
  }

  const displayPayee = payeeName || 'No payee set';
  const remainingColor = remaining === 0 ? theme.colors.positive : theme.colors.textMuted;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={handleDone} hitSlop={8}>
              <Ionicons name="checkmark" size={24} color={theme.colors.primary} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {/* Payee + amount pill */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.payeePill}>
              <Ionicons name="person-outline" size={16} color={theme.colors.textMuted} />
              <Text
                variant="body"
                color={payeeName ? theme.colors.textPrimary : theme.colors.textMuted}
                style={{ marginLeft: theme.spacing.xs, fontWeight: '500' }}
                numberOfLines={1}
              >
                {displayPayee}
              </Text>
            </View>
            <Amount
              value={totalCents}
              variant="bodyLg"
              weight="700"
              showSign
            />
          </View>
        </View>

        {/* Section header: Categories + remaining/total */}
        <View style={styles.sectionHeader}>
          <Text variant="captionSm" color={theme.colors.textMuted} style={styles.sectionText}>
            CATEGORIES
          </Text>
          <Text variant="captionSm" color={remainingColor} style={styles.sectionText}>
            {totalCents > 0
              ? `${formatAmount(Math.abs(remaining))} remaining`
              : `${formatAmount(totalAllocated)} total`}
          </Text>
        </View>

        {/* Split lines card */}
        <View style={styles.card}>
          {splits.map((line, index) => (
            <View key={line.id}>
              <SplitRow
                line={line}
                onAmountChange={handleAmountChange}
                onCategoryPress={handleCategoryPress}
                onRemove={handleRemove}
                onFocus={setActiveLineId}
                inputRef={getInputRef(line.id)}
              />
              {index < splits.length - 1 && (
                <View style={styles.divider} />
              )}
            </View>
          ))}

          <View style={styles.divider} />

          {/* Add category button */}
          <Pressable
            onPress={handleAdd}
            style={({ pressed }) => [
              styles.addButton,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="add-circle" size={20} color={theme.colors.primary} />
            <Text variant="body" color={theme.colors.primary} style={{ fontWeight: '600' }}>
              Add Another
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Floating "assign remaining" button — appears when keyboard is visible */}
      {keyboardVisible && totalCents > 0 && remaining > 0 && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              right: theme.spacing.lg,
              zIndex: 10,
              marginBottom: theme.spacing.sm,
              alignItems: 'center',
            },
            fabStyle,
          ]}
        >
          <Pressable onPress={handleAssignRemaining}>
            {isLiquidGlassAvailable() ? (
              <GlassView
                isInteractive
                style={styles.fab}
              >
                <Text variant="bodyLg" color={theme.colors.textPrimary} style={{ fontWeight: '700' }}>
                  {formatAmount(Math.abs(remaining))}
                </Text>
                <Text variant="captionSm" color={theme.colors.textSecondary}>
                  remaining
                </Text>
              </GlassView>
            ) : (
              <BlurView
                tint="systemChromeMaterial"
                intensity={100}
                style={[styles.fab, { overflow: 'hidden' }]}
              >
                <Text variant="bodyLg" color={theme.colors.textPrimary} style={{ fontWeight: '700' }}>
                  {formatAmount(Math.abs(remaining))}
                </Text>
                <Text variant="captionSm" color={theme.colors.textSecondary}>
                  remaining
                </Text>
              </BlurView>
            )}
          </Pressable>
        </Animated.View>
      )}
    </>
  );
}

const createStyles = (theme: Theme) => ({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  container: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  headerCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    padding: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  payeePill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
    marginRight: theme.spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.sm,
  },
  sectionText: {
    fontWeight: '700' as const,
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    overflow: 'hidden' as const,
  },
  divider: {
    height: theme.borderWidth.thin,
    backgroundColor: theme.colors.divider,
    marginHorizontal: theme.spacing.md,
  },
  addButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  fab: {
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center' as const,
  },
});
