import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { palette } from '../../../src/theme/colors';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { transferMultipleCategories } from '../../../src/budgets';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Amount } from '../../../src/presentation/components/atoms/Amount';
import { Button } from '../../../src/presentation/components/atoms/Button';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import { CompactCurrencyInput, type CompactCurrencyInputRef } from '../../../src/presentation/components/atoms/CompactCurrencyInput';
import { GlassButton } from '../../../src/presentation/components/atoms/GlassButton';

type SourceEntry = {
  id: string;
  name: string;
  balance: number;
  groupName: string;
  amount: number;
};

type MoveDirection = 'to' | 'from';

function SourceRow({
  source,
  direction,
  onAmountChange,
  onRemove,
}: {
  source: SourceEntry;
  direction: MoveDirection;
  onAmountChange: (id: string, cents: number) => void;
  onRemove: (id: string) => void;
}) {
  const { colors, spacing } = useTheme();
  const inputRef = useRef<CompactCurrencyInputRef>(null);
  // "to" → picked categories give money (balance decreases)
  // "from" → picked categories receive money (balance increases)
  const remainingBalance = direction === 'to'
    ? source.balance - source.amount
    : source.balance + source.amount;

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
      <Text variant="body" color={colors.textPrimary} numberOfLines={1} style={{ flex: 1 }}>
        {source.name}
      </Text>

      <CompactCurrencyInput
        ref={inputRef}
        value={source.amount}
        onChangeValue={(cents) => onAmountChange(source.id, cents)}
      />

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

      <IconButton
        icon="close-circle"
        size={18}
        color={colors.textMuted}
        onPress={() => onRemove(source.id)}
        style={{ marginLeft: spacing.xxs }}
      />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Direction Toggle (Apple-style switch with arrow icon)
// ---------------------------------------------------------------------------

const TRACK_WIDTH = 32;
const TRACK_HEIGHT = 56;
const THUMB_SIZE = 26;
const THUMB_TRAVEL = TRACK_HEIGHT - THUMB_SIZE - 6; // 3px padding top/bottom

function DirectionToggle({
  direction,
  onToggle,
}: {
  direction: MoveDirection;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(direction === 'to' ? 0 : 1);

  useEffect(() => {
    progress.value = withTiming(direction === 'to' ? 0 : 1, { duration: 250 });
  }, [direction]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, THUMB_TRAVEL]) },
    ],
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable onPress={() => { Haptics.selectionAsync(); onToggle(); }} hitSlop={8}>
        <View
          style={{
            width: TRACK_WIDTH,
            height: TRACK_HEIGHT,
            borderRadius: TRACK_WIDTH / 2,
            backgroundColor: 'rgba(255,255,255,0.3)',
            alignItems: 'center',
            paddingTop: 3,
          }}
        >
          <Animated.View
            style={[
              {
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                borderRadius: THUMB_SIZE / 2,
                backgroundColor: '#ffffff',
                alignItems: 'center',
                justifyContent: 'center',
              },
              thumbStyle,
            ]}
          >
            <Animated.View style={arrowStyle}>
              <Ionicons name="arrow-up" size={16} color={colors.primary} />
            </Animated.View>
          </Animated.View>
        </View>
      </Pressable>
      <Animated.View key={direction} entering={FadeIn.duration(200)} exiting={FadeOut.duration(100)}>
        <Text variant="captionSm" color="rgba(255,255,255,0.8)" style={{ fontWeight: '600' }}>
          {direction === 'to' ? 'From' : 'To'}
        </Text>
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

export default function MoveMoneyScreen() {
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

  const [direction, setDirection] = useState<MoveDirection>('to');
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const balanceCents = Number(balance);
  const totalAmount = sources.reduce((sum, s) => sum + s.amount, 0);
  // Projected balance: adding money (to) increases it, moving out (from) decreases it
  const projectedBalance = direction === 'to'
    ? balanceCents + totalAmount
    : balanceCents - totalAmount;


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
      setSources((prev) => [
        ...prev,
        { id: srcId, name: srcName, balance: srcBalance, groupName: '', amount: 0 },
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
      pathname: '/(auth)/budget/move-category-picker',
      params: { excludeIds, moveCatId: catId, direction },
    });
  }

  async function handleMove() {
    if (!catId || saving) return;
    setSaving(true);
    try {
      const entries = sources.filter((s) => s.amount > 0);
      if (entries.length === 0) return;
      await transferMultipleCategories(
        month,
        catId,
        entries.map((s) => ({ categoryId: s.id, amountCents: s.amount })),
        direction === 'to' ? 'to' : 'from',
      );
      await loadBudget();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  // Header color reflects budget health of the category
  const headerBg = projectedBalance > 0
    ? colors.positiveFill
    : projectedBalance < 0
      ? colors.negativeFill
      : colors.primary;
  const headerText = palette.white;

  return (
    <ScrollView
      style={{ backgroundColor: colors.pageBackground }}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom header with rounded bottom corners */}
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
        {/* Close button — top right */}
        <View style={{ position: 'absolute', top: 16, right: spacing.md }}>
          <GlassButton icon="xmark" onPress={() => router.back()} color={headerText} />
        </View>

        <Text variant="headingSm" color={headerText} align="center">
          {catName}
        </Text>

        {/* Balance pill — shows projected balance after move */}
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: br.full,
            paddingHorizontal: 12,
            paddingVertical: 4,
          }}
        >
          <Amount
            value={projectedBalance}
            variant="body"
            color={headerText}
            weight="700"
          />
        </View>

        {/* Animated direction toggle */}
        <DirectionToggle
          direction={direction}
          onToggle={() => setDirection((d) => (d === 'to' ? 'from' : 'to'))}
        />
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
                direction={direction}
                onAmountChange={handleAmountChange}
                onRemove={handleRemoveSource}
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
              {sources.length === 0 ? 'Add Category' : 'Add Another'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Move button */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
        <Button
          title={saving ? 'Moving...' : 'Move'}
          variant="primary"
          loading={saving}
          disabled={totalAmount === 0}
          onPress={handleMove}
          style={{ borderRadius: br.lg }}
        />
      </View>
    </ScrollView>
  );
}
