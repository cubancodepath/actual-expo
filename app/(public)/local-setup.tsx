import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  useTheme,
  useThemedStyles,
} from "../../src/presentation/providers/ThemeProvider";
import { Text } from "../../src/presentation/components/atoms/Text";
import { Button } from "../../src/presentation/components/atoms/Button";
import { Card } from "../../src/presentation/components/atoms/Card";
import { Icon } from "../../src/presentation/components/atoms/Icon";
import { CurrencyInput, type CurrencyInputRef } from "../../src/presentation/components/atoms/CurrencyInput";
import { CalculatorToolbar } from "../../src/presentation/components/atoms/CalculatorToolbar";
import { GlassButton } from "../../src/presentation/components/atoms/GlassButton";
import { KeyboardToolbar } from "../../src/presentation/components/molecules/KeyboardToolbar";
import { Banner } from "../../src/presentation/components/molecules/Banner";
import { usePrefsStore } from "../../src/stores/prefsStore";
import {
  DEFAULT_CATEGORY_GROUPS,
  getDefaultCategorySelection,
  seedLocalBudget,
  type CategorySelection,
} from "../../src/services/seedBudget";
import type { Theme } from "../../src/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PARALLAX = 0.28;
const SPRING = { damping: 26, stiffness: 280, mass: 1 } as const;

const STEPS = ["budget-name", "account", "categories", "ready"] as const;
type Step = (typeof STEPS)[number];
type Direction = "forward" | "backward";

function indexOf(s: Step) {
  return STEPS.indexOf(s);
}

// ─── Progress Bar ──────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const width = useSharedValue(step / total);

  useEffect(() => {
    const pct = step / total;
    width.value = reducedMotion
      ? pct
      : withSpring(pct, { damping: 28, stiffness: 200 });
  }, [step]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%` as any,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: step }}
      accessibilityLabel={`Step ${step} of ${total}`}
      style={{
        height: 3,
        backgroundColor: theme.colors.inputBorder,
        marginHorizontal: theme.spacing.xl,
      }}
    >
      <Animated.View
        style={[
          {
            height: "100%",
            backgroundColor: theme.colors.primary,
            borderRadius: 1.5,
          },
          fillStyle,
        ]}
      />
    </View>
  );
}

// ─── Category Row ──────────────────────────────────────────────────────────

function CategoryRow({
  cat,
  checked,
  onToggle,
  style,
}: {
  cat: { key: string; name: string };
  checked: boolean;
  onToggle: () => void;
  style: any;
}) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePress() {
    if (!reducedMotion) {
      scale.value = 0.75;
      scale.value = withSpring(1, { damping: 10, stiffness: 400 });
    }
    onToggle();
  }

  return (
    <Pressable onPress={handlePress} style={style}>
      <Animated.View style={iconStyle}>
        <Icon
          name={checked ? "checkmark-circle" : "ellipse-outline"}
          size={24}
          color={checked ? theme.colors.primary : theme.colors.textMuted}
        />
      </Animated.View>
      <Text
        variant="bodyLg"
        color={checked ? theme.colors.textPrimary : theme.colors.textMuted}
      >
        {cat.name}
      </Text>
    </Pressable>
  );
}

// ─── Ready Checkmark ───────────────────────────────────────────────────────

function ReadyCheckmark() {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) return;
    const t = setTimeout(() => {
      scale.value = withSpring(1, { damping: 10, stiffness: 260 });
    }, 200);
    return () => clearTimeout(t);
  }, []);

  const s = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      style={[
        {
          alignSelf: "center" as const,
          width: 80,
          height: 80,
          borderRadius: 40,
          backgroundColor: theme.colors.primarySubtle,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          marginBottom: theme.spacing.xl,
          marginTop: theme.spacing.xxxl,
        },
        s,
      ]}
    >
      <Icon name="checkmark-circle" size={48} color={theme.colors.positive} />
    </Animated.View>
  );
}

// ─── Back Link ─────────────────────────────────────────────────────────────

function BackLink({
  onPress,
  label = "Back",
}: {
  onPress: () => void;
  label?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        marginTop: theme.spacing.lg,
        alignSelf: "center" as const,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 2,
      }}
    >
      <Icon
        name="chevron-back-outline"
        size={16}
        color={theme.colors.textSecondary}
      />
      <Text variant="bodySm" color={theme.colors.textSecondary}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Summary Row ───────────────────────────────────────────────────────────

function SummaryRow({
  icon,
  label,
  value,
  delay: delayMs = 0,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  delay?: number;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  const translateY = useSharedValue(reducedMotion ? 0 : 8);

  useEffect(() => {
    if (reducedMotion) return;
    const t = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 280 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 260 });
    }, 200 + delayMs);
    return () => clearTimeout(t);
  }, []);

  const s = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.summaryRow, s]}>
      <Icon name={icon} size={20} color={theme.colors.primary} />
      <View style={{ flex: 1 }}>
        <Text variant="caption" color={theme.colors.textMuted}>
          {label}
        </Text>
        <Text variant="bodyLg" color={theme.colors.textPrimary}>
          {value}
        </Text>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────

export default function LocalSetupScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion() ?? false;

  const [step, setStep] = useState<Step>("budget-name");
  const [prevStep, setPrevStep] = useState<Step | null>(null);
  const [budgetName, setBudgetName] = useState("My Budget");
  const [accountName, setAccountName] = useState("Checking");
  const [startingBalance, setStartingBalance] = useState(0);
  const [categories, setCategories] = useState<CategorySelection>(
    getDefaultCategorySelection,
  );
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currencyInputRef = useRef<CurrencyInputRef>(null);

  const animating = useRef(false);
  const inX = useSharedValue(0);
  const outX = useSharedValue(0);

  const inStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: inX.value }],
  }));
  const outStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: outX.value }],
  }));

  function onTransitionDone() {
    animating.current = false;
    setPrevStep(null);
    outX.value = 0;
  }

  function goTo(next: Step) {
    if (animating.current) return;
    animating.current = true;

    const dir: Direction =
      indexOf(next) > indexOf(step) ? "forward" : "backward";

    if (reducedMotion) {
      setStep(next);
      animating.current = false;
      return;
    }

    // 1. Pre-position incoming panel offscreen
    inX.value = dir === "forward" ? SCREEN_WIDTH : -SCREEN_WIDTH * PARALLAX;
    outX.value = 0;

    // 2. Show outgoing (old step) immediately at current position
    setPrevStep(step);

    // 3. Change step content after one frame so inX is applied on UI thread
    requestAnimationFrame(() => {
      setStep(next);

      // 4. Start animations
      const outEnd =
        dir === "forward" ? -SCREEN_WIDTH * PARALLAX : SCREEN_WIDTH;
      inX.value = withSpring(0, SPRING, (done) => {
        if (done) scheduleOnRN(onTransitionDone);
      });
      outX.value = withSpring(outEnd, SPRING);
    });
  }

  const toggleCategory = useCallback((key: string) => {
    setCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSeed = useCallback(async () => {
    if (animating.current) return;
    setSeeding(true);
    setError(null);
    try {
      await seedLocalBudget({
        accountName: accountName.trim() || "Checking",
        startingBalance,
        selectedCategories: categories,
      });
      goTo("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  }, [accountName, startingBalance, categories, step]);

  function handleStart() {
    usePrefsStore.getState().setPrefs({
      isLocalOnly: true,
      budgetName: budgetName.trim() || "My Budget",
    });
  }

  // ── Step renderers ────────────────────────────────────────────────────

  function renderStep(s: Step): React.ReactNode {
    switch (s) {
      case "budget-name":
        return renderBudgetName();
      case "account":
        return renderAccount();
      case "categories":
        return renderCategories();
      case "ready":
        return renderReady();
    }
  }

  function renderBudgetName() {
    return (
      <ScrollView
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          variant="headingLg"
          color={theme.colors.textPrimary}
          style={styles.heading}
        >
          What should we call your budget?
        </Text>
        <Text
          variant="bodySm"
          color={theme.colors.textSecondary}
          style={styles.subtext}
        >
          You can always change this later.
        </Text>
        <View style={styles.inputContainer}>
          <Ionicons
            name="document-text-outline"
            size={18}
            color={theme.colors.textMuted}
          />
          <TextInput
            style={[styles.input, { color: theme.colors.textPrimary }]}
            value={budgetName}
            onChangeText={setBudgetName}
            placeholder="My Budget"
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => goTo("account")}
          />
        </View>
        <Button
          title="Continue"
          onPress={() => goTo("account")}
          size="lg"
          disabled={!budgetName.trim()}
          style={styles.actionButton}
        />
        <BackLink onPress={() => router.back()} label="Cancel" />
      </ScrollView>
    );
  }

  function renderAccount() {
    return (
      <ScrollView
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          variant="headingLg"
          color={theme.colors.textPrimary}
          style={styles.heading}
        >
          Add your first account
        </Text>
        <Text
          variant="bodySm"
          color={theme.colors.textSecondary}
          style={styles.subtext}
        >
          This is usually your main checking account.
        </Text>
        <Text
          variant="caption"
          color={theme.colors.textSecondary}
          style={styles.label}
        >
          ACCOUNT NAME
        </Text>
        <View style={styles.inputContainer}>
          <Ionicons
            name="wallet-outline"
            size={18}
            color={theme.colors.textMuted}
          />
          <TextInput
            style={[styles.input, { color: theme.colors.textPrimary }]}
            value={accountName}
            onChangeText={setAccountName}
            placeholder="Checking"
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
            returnKeyType="next"
          />
        </View>
        <Text
          variant="caption"
          color={theme.colors.textSecondary}
          style={styles.label}
        >
          CURRENT BALANCE
        </Text>
        <CurrencyInput
          ref={currencyInputRef}
          value={startingBalance}
          onChangeValue={setStartingBalance}
          type="income"
          color={theme.colors.textPrimary}
        />
        <Button
          title="Continue"
          onPress={() => goTo("categories")}
          size="lg"
          disabled={!accountName.trim()}
          style={styles.actionButton}
        />
        <BackLink onPress={() => goTo("budget-name")} />
      </ScrollView>
    );
  }

  function renderCategories() {
    const visibleGroups = DEFAULT_CATEGORY_GROUPS.filter((g) => !g.is_income);

    return (
      <ScrollView
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          variant="headingLg"
          color={theme.colors.textPrimary}
          style={styles.heading}
        >
          Choose your categories
        </Text>
        <Text
          variant="bodySm"
          color={theme.colors.textSecondary}
          style={styles.subtext}
        >
          Uncheck any you don't need. You can add more later.
        </Text>

        {visibleGroups.map((group) => (
          <View key={group.key} style={styles.categoryGroup}>
            <Text
              variant="caption"
              color={theme.colors.textSecondary}
              style={styles.groupLabel}
            >
              {group.name.toUpperCase()}
            </Text>
            {group.categories.map((cat) => (
              <CategoryRow
                key={cat.key}
                cat={cat}
                checked={categories[cat.key]}
                onToggle={() => toggleCategory(cat.key)}
                style={styles.checkRow}
              />
            ))}
          </View>
        ))}

        <Button
          title="Set Up Budget"
          onPress={handleSeed}
          size="lg"
          loading={seeding}
          disabled={seeding}
          style={styles.actionButton}
        />
        <BackLink onPress={() => goTo("account")} />
      </ScrollView>
    );
  }

  function renderReady() {
    const selectedCount = Object.values(categories).filter(Boolean).length;
    const balanceText = (startingBalance / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });

    return (
      <ScrollView contentContainerStyle={styles.stepContent}>
        <ReadyCheckmark />
        <Text
          variant="displaySm"
          color={theme.colors.textPrimary}
          align="center"
          style={styles.heading}
        >
          You're all set!
        </Text>
        <Text
          variant="body"
          color={theme.colors.textSecondary}
          align="center"
          style={styles.subtext}
        >
          Your budget is ready to go.
        </Text>
        <Card style={styles.summaryCard}>
          <SummaryRow
            icon="document-text-outline"
            label="Budget"
            value={budgetName}
            delay={0}
          />
          <SummaryRow
            icon="wallet-outline"
            label="Account"
            value={`${accountName} · ${balanceText}`}
            delay={60}
          />
          <SummaryRow
            icon="layers-outline"
            label="Categories"
            value={`${selectedCount} categories`}
            delay={120}
          />
        </Card>
        <Button
          title="Start Budgeting"
          onPress={handleStart}
          size="lg"
          icon="arrow-forward-outline"
          style={styles.actionButton}
        />
      </ScrollView>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top + 12 }}>
        <ProgressBar step={indexOf(step) + 1} total={STEPS.length} />
      </View>

      {error && (
        <View
          style={{
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.sm,
          }}
        >
          <Banner
            message={error}
            variant="error"
            onDismiss={() => setError(null)}
          />
        </View>
      )}

      {/* Transition container */}
      <View style={{ flex: 1, overflow: "hidden" }}>
        {/* Outgoing panel (previous step, visible during animation) */}
        {prevStep !== null && (
          <Animated.View
            style={[
              {
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: theme.colors.pageBackground,
              },
              outStyle,
            ]}
            pointerEvents="none"
          >
            {renderStep(prevStep)}
          </Animated.View>
        )}
        {/* Current panel */}
        <Animated.View
          style={[
            {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: theme.colors.pageBackground,
            },
            inStyle,
          ]}
        >
          {renderStep(step)}
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
    <KeyboardToolbar>
      <CalculatorToolbar
        onOperator={(op) => currencyInputRef.current?.injectOperator(op)}
        onEvaluate={() => currencyInputRef.current?.evaluate()}
      />
      <View style={{ flex: 1 }} />
      <GlassButton
        icon="checkmark"
        iconSize={16}
        variant="tinted"
        tintColor={theme.colors.primary}
        onPress={() => Keyboard.dismiss()}
      />
    </KeyboardToolbar>
    </>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const createStyles = (theme: Theme) => ({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  stepContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
  },
  heading: {
    marginBottom: theme.spacing.sm,
  },
  subtext: {
    marginBottom: theme.spacing.xl,
  },
  label: {
    letterSpacing: 0.8,
    fontWeight: "600" as const,
    marginTop: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  inputContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: theme.colors.inputBackground,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.inputBorder,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
    minHeight: 50,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: theme.spacing.md,
  },
  actionButton: {
    marginTop: theme.spacing.xl,
  },
  categoryGroup: {
    marginBottom: theme.spacing.lg,
  },
  groupLabel: {
    letterSpacing: 0.8,
    fontWeight: "600" as const,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.xs,
  },
  checkRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
  },
  summaryCard: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  summaryRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing.md,
  },
});
