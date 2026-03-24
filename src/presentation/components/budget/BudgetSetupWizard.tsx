import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { IconName } from "../atoms/iconRegistry";
import { useTranslation } from "react-i18next";
import { scheduleOnRN } from "react-native-worklets";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { Button } from "../atoms/Button";
import { Card } from "../atoms/Card";
import { Icon } from "../atoms/Icon";
import { Input } from "../atoms/Input";
import { CurrencyInput, type CurrencyInputRef } from "../currency-input";
import { Banner } from "../molecules/Banner";
import { usePrefsStore } from "../../../stores/prefsStore";
import {
  DEFAULT_CATEGORY_GROUPS,
  getDefaultCategorySelection,
  seedLocalBudget,
  type CategorySelection,
} from "../../../services/seedBudget";
import {
  ensureBudgetsDir,
  idFromBudgetName,
  getBudgetDir,
  writeMetadata,
} from "../../../services/budgetMetadata";
import { openDatabase } from "@core/db";
import { loadClock, fullSync } from "@core/sync";
import { uploadBudget } from "../../../services/budgetfiles";
import type { Theme } from "../../../theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PARALLAX = 0.28;
const SPRING = { damping: 26, stiffness: 280, mass: 1 } as const;

const STEPS = ["budget-name", "account", "categories", "ready"] as const;
type Step = (typeof STEPS)[number];
type Direction = "forward" | "backward";

function indexOf(s: Step) {
  return STEPS.indexOf(s);
}

export type BudgetSetupMode = "local" | "server";

type Props = {
  mode: BudgetSetupMode;
  onCancel: () => void;
  onComplete?: () => void;
};

// ─── Progress Bar ──────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const width = useSharedValue(step / total);

  useEffect(() => {
    const pct = step / total;
    width.value = reducedMotion ? pct : withSpring(pct, { damping: 28, stiffness: 200 });
  }, [step]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%` as any,
  }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: step }}
      accessibilityLabel={`Step ${step} of ${total}`} // a11y, intentionally not i18n
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
          name={checked ? "checkmarkCircle" : "ellipseOutline"}
          size={24}
          color={checked ? theme.colors.primary : theme.colors.textMuted}
        />
      </Animated.View>
      <Text variant="bodyLg" color={checked ? theme.colors.textPrimary : theme.colors.textMuted}>
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
      <Icon name="checkmarkCircle" size={48} color={theme.colors.positive} />
    </Animated.View>
  );
}

// ─── Back Link ─────────────────────────────────────────────────────────────

function BackLink({ onPress, label = "Back" }: { onPress: () => void; label?: string }) {
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
      <Icon name="chevronBackOutline" size={16} color={theme.colors.textSecondary} />
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
  icon: IconName;
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

// ─── Main Component ─────────────────────────────────────────────────────────

export function BudgetSetupWizard({ mode, onCancel, onComplete }: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion() ?? false;
  const { t } = useTranslation("setup");

  const [step, setStep] = useState<Step>("budget-name");
  const [prevStep, setPrevStep] = useState<Step | null>(null);
  const [budgetName, setBudgetName] = useState("My Budget");
  const [accountName, setAccountName] = useState("Checking");
  const [startingBalance, setStartingBalance] = useState(0);
  const [categories, setCategories] = useState<CategorySelection>(getDefaultCategorySelection);
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

    const dir: Direction = indexOf(next) > indexOf(step) ? "forward" : "backward";

    if (reducedMotion) {
      setStep(next);
      animating.current = false;
      return;
    }

    inX.value = dir === "forward" ? SCREEN_WIDTH : -SCREEN_WIDTH * PARALLAX;
    outX.value = 0;
    setPrevStep(step);

    requestAnimationFrame(() => {
      setStep(next);
      const outEnd = dir === "forward" ? -SCREEN_WIDTH * PARALLAX : SCREEN_WIDTH;
      inX.value = withSpring(0, SPRING, (done) => {
        if (done) scheduleOnRN(onTransitionDone);
      });
      outX.value = withSpring(outEnd, SPRING);
    });
  }

  const toggleCategory = useCallback((key: string) => {
    setCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const budgetIdRef = useRef("");
  const uploadResultRef = useRef<{ cloudFileId: string; groupId: string } | null>(null);

  const handleSeed = useCallback(async () => {
    if (animating.current) return;
    setSeeding(true);
    setError(null);
    try {
      const name = budgetName.trim() || "My Budget";
      const budgetId = idFromBudgetName(name);
      if (__DEV__) console.log("[wizard] Creating budget:", budgetId, "mode:", mode);

      await ensureBudgetsDir();
      await writeMetadata(budgetId, { id: budgetId, budgetName: name });
      await openDatabase(getBudgetDir(budgetId));
      if (__DEV__) console.log("[wizard] DB opened, loading clock");
      await loadClock();

      if (__DEV__) console.log("[wizard] Seeding budget data");
      await seedLocalBudget({
        accountName: accountName.trim() || "Checking",
        startingBalance,
        selectedCategories: categories,
      });
      if (__DEV__) console.log("[wizard] Seed complete");

      budgetIdRef.current = budgetId;

      // In server mode, upload the budget now but defer setting prefs
      // until the user taps "Start Budgeting" (so routing doesn't switch early)
      if (mode === "server") {
        if (__DEV__) console.log("[wizard] Uploading to server...");
        const { serverUrl, token } = usePrefsStore.getState();
        const result = await uploadBudget(serverUrl, token, budgetId);
        uploadResultRef.current = result;
        if (__DEV__) console.log("[wizard] Upload success:", JSON.stringify(result));
      }

      goTo("ready");
    } catch (e) {
      if (__DEV__) console.error("[wizard] Error:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSeeding(false);
    }
  }, [accountName, startingBalance, categories, budgetName, step, mode]);

  async function handleStart() {
    const name = budgetName.trim() || "My Budget";
    if (__DEV__) console.log("[wizard] handleStart, mode:", mode, "budgetId:", budgetIdRef.current);

    // Close the raw DB opened during seed and do a proper openBudget
    // which initializes spreadsheet, pre-fetches queries, etc.
    const { closeDatabase } = await import("@core/db");
    await closeDatabase();
    const { openBudget } = await import("../../../services/budgetfiles");
    await openBudget(budgetIdRef.current);

    if (mode === "local") {
      usePrefsStore.getState().setPrefs({
        isLocalOnly: true,
      });
    } else {
      const result = uploadResultRef.current;
      if (__DEV__) console.log("[wizard] Setting server prefs:", JSON.stringify(result));
      usePrefsStore.getState().setPrefs({
        fileId: result?.cloudFileId ?? "",
        groupId: result?.groupId ?? "",
        isLocalOnly: false,
      });
      fullSync().catch((e) => {
        if (__DEV__) console.warn(e);
      });
    }
    onComplete?.();
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
      <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
        <Text variant="headingLg" color={theme.colors.textPrimary} style={styles.heading}>
          {t("name.heading")}
        </Text>
        <Text variant="bodySm" color={theme.colors.textSecondary} style={styles.subtext}>
          {t("name.subtext")}
        </Text>
        <Input
          icon="documentTextOutline"
          value={budgetName}
          onChangeText={setBudgetName}
          placeholder={t("name.placeholder")}
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => goTo("account")}
        />
        <Button
          title={t("continue")}
          onPress={() => goTo("account")}
          size="lg"
          disabled={!budgetName.trim()}
          style={styles.actionButton}
        />
        <BackLink onPress={onCancel} label={t("cancel")} />
      </ScrollView>
    );
  }

  function renderAccount() {
    return (
      <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
        <Text variant="headingLg" color={theme.colors.textPrimary} style={styles.heading}>
          {t("account.heading")}
        </Text>
        <Text variant="bodySm" color={theme.colors.textSecondary} style={styles.subtext}>
          {t("account.subtext")}
        </Text>
        <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
          {t("account.nameLabel")}
        </Text>
        <Input
          icon="wallet"
          value={accountName}
          onChangeText={setAccountName}
          placeholder={t("account.placeholder")}
          autoFocus
          returnKeyType="next"
        />
        <Text variant="caption" color={theme.colors.textSecondary} style={styles.label}>
          {t("account.balanceLabel")}
        </Text>
        <CurrencyInput
          ref={currencyInputRef}
          value={startingBalance}
          onChangeValue={setStartingBalance}
          type="income"
          color={theme.colors.textPrimary}
        />
        <Button
          title={t("continue")}
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
    const buttonTitle =
      mode === "server" ? t("categories.buttonServer") : t("categories.buttonLocal");

    return (
      <ScrollView contentContainerStyle={styles.stepContent} keyboardShouldPersistTaps="handled">
        <Text variant="headingLg" color={theme.colors.textPrimary} style={styles.heading}>
          {t("categories.heading")}
        </Text>
        <Text variant="bodySm" color={theme.colors.textSecondary} style={styles.subtext}>
          {t("categories.subtext")}
        </Text>

        {visibleGroups.map((group) => (
          <View key={group.key} style={styles.categoryGroup}>
            <Text variant="caption" color={theme.colors.textSecondary} style={styles.groupLabel}>
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
          title={buttonTitle}
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
          {t("ready.heading")}
        </Text>
        <Text
          variant="body"
          color={theme.colors.textSecondary}
          align="center"
          style={styles.subtext}
        >
          {mode === "server" ? t("ready.subtextServer") : t("ready.subtextLocal")}
        </Text>
        <Card style={styles.summaryCard}>
          <SummaryRow
            icon="documentTextOutline"
            label={t("ready.budget")}
            value={budgetName}
            delay={0}
          />
          <SummaryRow
            icon="wallet"
            label={t("ready.account")}
            value={`${accountName} · ${balanceText}`}
            delay={60}
          />
          <SummaryRow
            icon="layersOutline"
            label={t("ready.categories")}
            value={t("ready.categoriesCount", { count: selectedCount })}
            delay={120}
          />
        </Card>
        <Button
          title={t("ready.button")}
          onPress={handleStart}
          size="lg"
          icon="arrowForwardOutline"
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
            <Banner message={error} variant="error" onDismiss={() => setError(null)} />
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
