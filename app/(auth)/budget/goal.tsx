import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, View } from "react-native";
import { Icon } from "@/presentation/components/atoms/Icon";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Host, DatePicker, Picker, Text as SwiftText } from "@expo/ui/swift-ui";
import { useTranslation } from "react-i18next";
import { datePickerStyle, frame, pickerStyle, tag, tint } from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useBudgetStore } from "@/stores/budgetStore";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { Card } from "@/presentation/components/atoms/Card";
import { ListItem } from "@/presentation/components/molecules/ListItem";
import { Divider } from "@/presentation/components/atoms/Divider";
import { CurrencyInput, type CurrencyInputRef } from "@/presentation/components/currency-input";
import { getGoalTemplates, setGoalTemplates } from "@/goals";
import { updateGoalIndicator } from "@/goals/apply";
import { amountToInteger, integerToAmount } from "@/goals/engine";
import { batchMessages } from "@/sync";
import { formatDateLong } from "@/lib/date";
import { formatBalance } from "@/lib/format";
import type { Template } from "@/goals/types";

// ---------------------------------------------------------------------------
// Type options
// ---------------------------------------------------------------------------

type GoalType =
  | "simple"
  | "goal"
  | "by"
  | "average"
  | "copy"
  | "periodic"
  | "spend"
  | "percentage"
  | "remainder"
  | "limit";

const TYPE_OPTION_KEYS: { value: GoalType; key: string }[] = [
  { value: "simple", key: "goalTypeSimple" },
  { value: "goal", key: "goalTypeGoal" },
  { value: "by", key: "goalTypeBy" },
  { value: "average", key: "goalTypeAverage" },
  { value: "copy", key: "goalTypeCopy" },
  { value: "periodic", key: "goalTypePeriodic" },
  { value: "spend", key: "goalTypeSpend" },
  { value: "percentage", key: "goalTypePercentage" },
  { value: "remainder", key: "goalTypeRemainder" },
  { value: "limit", key: "goalTypeLimit" },
];

const TYPE_DESCRIPTION_KEYS: Record<GoalType, string> = {
  simple: "goalDescSimple",
  goal: "goalDescGoal",
  by: "goalDescBy",
  average: "goalDescAverage",
  copy: "goalDescCopy",
  periodic: "goalDescPeriodic",
  spend: "goalDescSpend",
  percentage: "goalDescPercentage",
  remainder: "goalDescRemainder",
  limit: "goalDescLimit",
};

const AVG_OPTION_KEYS = ["3months", "6months", "12months"];
const AVG_VALUES = [3, 6, 12];

const PERIOD_OPTION_KEYS = [
  { value: "day", key: "daily" },
  { value: "week", key: "weekly" },
  { value: "month", key: "monthly" },
  { value: "year", key: "yearly" },
];

const LIMIT_PERIOD_OPTION_KEYS = [
  { value: "daily", key: "daily" },
  { value: "weekly", key: "weekly" },
  { value: "monthly", key: "monthly" },
];

function getDefaultTargetDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 6, 1);
}

function dateToMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dateToInt(d: Date): number {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return parseInt(`${y}${m}${day}`, 10);
}

// ---------------------------------------------------------------------------
// Reusable picker row — renders a ListItem with a SwiftUI menu picker on the right
// ---------------------------------------------------------------------------

function MenuPickerRow<T extends string | number>({
  label,
  selection,
  options,
  onSelectionChange,
  pickerWidth = 180,
}: {
  label: string;
  selection: T;
  options: { value: T; label: string }[];
  onSelectionChange: (value: T) => void;
  pickerWidth?: number;
}) {
  const { colors } = useTheme();
  return (
    <ListItem
      title={label}
      right={
        <Host matchContents>
          <Picker
            selection={selection}
            onSelectionChange={(val) => onSelectionChange(val as T)}
            modifiers={[
              pickerStyle("menu"),
              tint(colors.primary),
              frame({ minWidth: pickerWidth, alignment: "trailing" }),
            ]}
          >
            {options.map((opt) => (
              <SwiftText key={String(opt.value)} modifiers={[tag(opt.value)]}>
                {opt.label}
              </SwiftText>
            ))}
          </Picker>
        </Host>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function GoalEditorScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { categoryId, dismissCount } = useLocalSearchParams<{ categoryId: string; dismissCount?: string }>();
  const dismiss = () => router.dismiss(Number(dismissCount) || 1);

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const currencyInputRef = useRef<CurrencyInputRef>(null);
  // Common state
  const [goalType, setGoalType] = useState<GoalType>("simple");
  const [amountCents, setAmountCents] = useState(0);

  // Simple-specific: "set aside" (false) vs "refill to" (true)
  const [simpleRefill, setSimpleRefill] = useState(false);
  const [capEnabled, setCapEnabled] = useState(false);
  const [capCents, setCapCents] = useState(0);

  // By-specific
  const [targetDate, setTargetDate] = useState<Date>(getDefaultTargetDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [byRepeat, setByRepeat] = useState(false);

  // Average-specific
  const [avgIndex, setAvgIndex] = useState(0);

  // Copy-specific
  const [lookBack, setLookBack] = useState(1);

  // Periodic-specific
  const [periodicPeriod, setPeriodicPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const [periodicInterval, setPeriodicInterval] = useState(1);
  const [periodicStart, setPeriodicStart] = useState<Date | null>(null);
  const [showPeriodicStartPicker, setShowPeriodicStartPicker] = useState(false);

  // Spend-specific
  const [spendFromDate, setSpendFromDate] = useState<Date>(() => new Date());
  const [spendToDate, setSpendToDate] = useState<Date>(getDefaultTargetDate);
  const [showSpendFromPicker, setShowSpendFromPicker] = useState(false);
  const [showSpendToPicker, setShowSpendToPicker] = useState(false);
  const [spendRepeat, setSpendRepeat] = useState(false);

  // Percentage-specific
  const [percent, setPercent] = useState(10);
  const [percentCategory, setPercentCategory] = useState("all-income");
  const [percentPrevious, setPercentPrevious] = useState(false);

  // Remainder-specific
  const [weight, setWeight] = useState(1);

  // Limit-specific
  const [limitPeriod, setLimitPeriod] = useState<"daily" | "weekly" | "monthly">("monthly");
  const [limitHold, setLimitHold] = useState(false);
  const [limitRefill, setLimitRefill] = useState(false);

  // Income categories for percentage picker
  const categories = useCategoriesStore((s) => s.categories);
  const groups = useCategoriesStore((s) => s.groups);
  const incomeCategories = categories.filter((c) => {
    const group = groups.find((g) => g.id === c.cat_group);
    return group?.is_income && !c.tombstone;
  });

  // Load existing template
  useEffect(() => {
    if (!categoryId) return;
    (async () => {
      const templates = await getGoalTemplates(categoryId);
      if (templates.length === 0) return;
      setIsEditing(true);

      // Detect refill templates — these map to Monthly with refill toggle:
      // - `simple` with `limit` but no `monthly` (#template up to X)
      // - legacy `[limit, refill]` pair from older Expo saves
      const simpleWithLimitOnly = templates.find(
        (t): t is import("@/goals/types").SimpleTemplate =>
          t.type === "simple" && !!t.limit && t.monthly == null,
      );
      if (simpleWithLimitOnly?.limit) {
        setGoalType("simple");
        setAmountCents(amountToInteger(simpleWithLimitOnly.limit.amount));
        setSimpleRefill(true);
        return;
      }

      // Legacy: [limit, refill] pair → convert to Monthly+refill
      const hasRefill = templates.some((t) => t.type === "refill");
      const limitT = templates.find((t) => t.type === "limit");
      if (hasRefill && limitT) {
        setGoalType("simple");
        setAmountCents(amountToInteger(limitT.amount));
        setSimpleRefill(true);
        return;
      }

      const t = templates[0];
      if (t.type === "refill" || t.type === "limit") return;
      setGoalType(t.type);

      switch (t.type) {
        case "simple":
          setAmountCents(t.monthly != null ? amountToInteger(t.monthly) : 0);
          if (t.limit) {
            setCapEnabled(true);
            setCapCents(amountToInteger(t.limit.amount));
          }
          break;
        case "goal":
          setAmountCents(amountToInteger(t.amount));
          break;
        case "by": {
          setAmountCents(amountToInteger(t.amount));
          const [y, m] = t.month.split("-").map(Number);
          setTargetDate(new Date(y, m - 1, 1));
          if (t.repeat) setByRepeat(true);
          break;
        }
        case "average":
          setAvgIndex(AVG_VALUES.indexOf(t.numMonths));
          break;
        case "copy":
          setLookBack(t.lookBack);
          break;
        case "periodic":
          setAmountCents(amountToInteger(t.amount));
          setPeriodicPeriod(t.period.period);
          setPeriodicInterval(t.period.amount);
          if (t.starting) setPeriodicStart(new Date(t.starting));
          break;
        case "spend": {
          setAmountCents(amountToInteger(t.amount));
          const [ty, tm] = t.month.split("-").map(Number);
          setSpendToDate(new Date(ty, tm - 1, 1));
          const [fy, fm] = t.from.split("-").map(Number);
          setSpendFromDate(new Date(fy, fm - 1, 1));
          if (t.repeat) setSpendRepeat(true);
          break;
        }
        case "percentage":
          setPercent(t.percent);
          setPercentCategory(t.category);
          setPercentPrevious(t.previous);
          break;
        case "remainder":
          setWeight(t.weight);
          break;
      }
    })();
  }, [categoryId]);

  function buildTemplates(): Template[] {
    const displayAmount = integerToAmount(amountCents);

    switch (goalType) {
      case "simple":
        if (simpleRefill) {
          // "#template up to X" — refill to amount
          return [
            {
              type: "simple",
              limit: { amount: displayAmount, hold: false, period: "monthly" as const },
              priority: 0,
              directive: "template" as const,
            },
          ];
        }
        // "#template X" or "#template X up to Y" — fixed monthly with optional balance cap
        if (capEnabled && capCents > 0) {
          return [
            {
              type: "simple",
              monthly: displayAmount,
              limit: { amount: integerToAmount(capCents), hold: false, period: "monthly" as const },
              priority: 0,
              directive: "template" as const,
            },
          ];
        }
        return [{ type: "simple", monthly: displayAmount, priority: 0, directive: "template" }];
      case "goal":
        return [{ type: "goal", amount: displayAmount, directive: "goal" }];
      case "by":
        return [
          {
            type: "by",
            amount: displayAmount,
            month: dateToMonth(targetDate),
            ...(byRepeat ? { repeat: 12, annual: true } : {}),
            priority: 0,
            directive: "template",
          },
        ];
      case "average":
        return [
          { type: "average", numMonths: AVG_VALUES[avgIndex], priority: 0, directive: "template" },
        ];
      case "copy":
        return [{ type: "copy", lookBack, priority: 0, directive: "template" }];
      case "periodic":
        return [
          {
            type: "periodic",
            amount: displayAmount,
            period: { period: periodicPeriod, amount: periodicInterval },
            ...(periodicStart ? { starting: periodicStart.toISOString().slice(0, 10) } : {}),
            priority: 0,
            directive: "template",
          },
        ];
      case "spend":
        return [
          {
            type: "spend",
            amount: displayAmount,
            month: dateToMonth(spendToDate),
            from: dateToMonth(spendFromDate),
            ...(spendRepeat ? { repeat: 12, annual: true } : {}),
            priority: 0,
            directive: "template",
          },
        ];
      case "percentage":
        return [
          {
            type: "percentage",
            percent,
            previous: percentPrevious,
            category: percentCategory,
            priority: 0,
            directive: "template",
          },
        ];
      case "remainder":
        return [{ type: "remainder", weight, directive: "template" }];
      case "limit": {
        // Pure spending cap: "#template 0 up to X" — no auto-budgeting
        return [
          {
            type: "simple" as const,
            monthly: 0,
            limit: { amount: displayAmount, hold: limitHold, period: limitPeriod },
            priority: 0,
            directive: "template" as const,
          },
        ];
      }
    }
  }

  const canSave = (() => {
    switch (goalType) {
      case "simple":
        if (capEnabled) return amountCents > 0 && capCents > amountCents;
        return amountCents > 0;
      case "goal":
      case "by":
      case "periodic":
      case "spend":
      case "limit":
        return amountCents > 0;
      case "percentage":
        return percent > 0;
      case "average":
      case "copy":
      case "remainder":
        return true;
    }
  })();

  async function handleSave() {
    if (!categoryId || saving) return;
    setSaving(true);
    try {
      const catNames = new Map(categories.map((c) => [c.id, c.name]));
      await batchMessages(async () => {
        await setGoalTemplates(categoryId, buildTemplates(), catNames);
      });
      // Update goal indicator AFTER batchMessages so it reads the fresh goal_def
      await updateGoalIndicator(useBudgetStore.getState().month, categoryId);
      dismiss();
    } catch {
      Alert.alert(t("couldNotSaveTitle"), t("couldNotSaveMessage"));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!categoryId) return;
    Alert.alert(t("removeTargetTitle"), t("removeTargetMessage"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("remove"),
        style: "destructive",
        onPress: async () => {
          try {
            await setGoalTemplates(categoryId, []);
            dismiss();
          } catch {
            Alert.alert(t("errorTitle"), t("couldNotRemoveTarget"));
          }
        },
      },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Shared sub-components
  // ---------------------------------------------------------------------------

  function DateRow({
    label,
    date,
    show,
    onToggle,
    onDateChange,
  }: {
    label: string;
    date: Date;
    show: boolean;
    onToggle: () => void;
    onDateChange: (d: Date) => void;
  }) {
    return (
      <>
        <ListItem
          title={label}
          right={
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
              <Text variant="body" color={colors.primary}>
                {formatDateLong(dateToInt(date))}
              </Text>
              <Icon name={show ? "chevronUp" : "chevronDown"} size={16} color={colors.textMuted} />
            </View>
          }
          onPress={onToggle}
        />
        {show && (
          <View style={{ paddingHorizontal: spacing.md }}>
            <Host matchContents={{ vertical: true }}>
              <DatePicker
                selection={date}
                displayedComponents={["date"]}
                modifiers={[datePickerStyle("graphical"), tint(colors.primary)]}
                onDateChange={(d) => {
                  onDateChange(d);
                  onToggle();
                }}
              />
            </Host>
          </View>
        )}
      </>
    );
  }

  function ToggleRow({
    label,
    value,
    onValueChange,
  }: {
    label: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
  }) {
    return (
      <ListItem
        title={label}
        right={
          <Switch
            value={value}
            onValueChange={onValueChange}
            trackColor={{ false: colors.divider, true: colors.primary }}
          />
        }
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.pageBackground }}
        contentContainerStyle={{ padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <Stack.Screen options={{}} />
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button icon="xmark" onPress={() => dismiss()} />
        </Stack.Toolbar>

        {/* ── Type selector ──────────────────────────────────────── */}
        <Card style={{ padding: 0, overflow: "hidden" as const, marginBottom: spacing.sm }}>
          <MenuPickerRow
            label={t("goalType")}
            selection={goalType}
            options={TYPE_OPTION_KEYS.map((o) => ({ value: o.value, label: t(o.key as any) }))}
            onSelectionChange={setGoalType}
            pickerWidth={220}
          />
        </Card>
        <Text
          variant="captionSm"
          color={colors.textMuted}
          style={{ marginBottom: spacing.lg, paddingHorizontal: spacing.xs }}
        >
          {t(TYPE_DESCRIPTION_KEYS[goalType] as any)}
        </Text>

        {/* ── Shared amount input (always mounted for types that need it) ── */}
        {["simple", "goal", "by", "periodic", "spend", "limit"].includes(goalType) && (
          <Card style={{ padding: 0, overflow: "hidden" as const, marginBottom: spacing.sm }}>
            <View style={{ padding: spacing.md }}>
              <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xs }}>
                {goalType === "simple"
                  ? simpleRefill
                    ? t("refillTo")
                    : t("monthlyAmount")
                  : goalType === "goal"
                    ? t("targetBalance")
                    : goalType === "limit"
                      ? t("maximumSpending")
                      : goalType === "periodic"
                        ? t("amountPerOccurrence")
                        : t("targetAmount")}
              </Text>
              <CurrencyInput
                ref={currencyInputRef}
                value={amountCents}
                onChangeValue={setAmountCents}
                type="income"
                autoFocus
              />
            </View>
          </Card>
        )}

        {/* ── Type-specific fields ───────────────────────────────── */}
        <Card style={{ padding: 0, overflow: "hidden" as const }}>
          {/* Simple */}
          {goalType === "simple" && (
            <View>
              <ToggleRow
                label={t("refillMode")}
                value={simpleRefill}
                onValueChange={(v) => {
                  setSimpleRefill(v);
                  if (v) {
                    setCapEnabled(false);
                    setCapCents(0);
                  }
                }}
              />
              {!simpleRefill && (
                <>
                  <Divider inset />
                  <ToggleRow
                    label={t("balanceCap")}
                    value={capEnabled}
                    onValueChange={setCapEnabled}
                  />
                  {capEnabled && (
                    <>
                      <Divider inset />
                      <ListItem
                        title={t("maximumBalance")}
                        right={
                          <CurrencyInput
                            value={capCents}
                            onChangeValue={setCapCents}
                            type="income"
                            compact
                            style={{ paddingVertical: 0 }}
                          />
                        }
                      />
                    </>
                  )}
                </>
              )}
            </View>
          )}

          {/* Goal — no extra fields, amount input is shared above */}
          {goalType === "goal" && null}

          {/* By */}
          {goalType === "by" && (
            <View>
              <DateRow
                label={t("targetDate")}
                date={targetDate}
                show={showDatePicker}
                onToggle={() => setShowDatePicker(!showDatePicker)}
                onDateChange={setTargetDate}
              />
              <Divider inset />
              <ToggleRow label={t("repeatAnnually")} value={byRepeat} onValueChange={setByRepeat} />
            </View>
          )}

          {/* Average */}
          {goalType === "average" && (
            <View style={{ padding: spacing.md }}>
              <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
                {t("lookBackPeriod")}
              </Text>
              <Host matchContents>
                <Picker
                  selection={AVG_VALUES[avgIndex]}
                  onSelectionChange={(val) => setAvgIndex(AVG_VALUES.indexOf(val as number))}
                  modifiers={[pickerStyle("segmented"), tint(colors.primary)]}
                >
                  {AVG_VALUES.map((v, i) => (
                    <SwiftText key={v} modifiers={[tag(v)]}>
                      {t(AVG_OPTION_KEYS[i] as any)}
                    </SwiftText>
                  ))}
                </Picker>
              </Host>
            </View>
          )}

          {/* Copy */}
          {goalType === "copy" && (
            <MenuPickerRow
              label={t("copyFrom")}
              selection={lookBack}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: i + 1,
                label: t("monthsAgo", { count: i + 1 }),
              }))}
              onSelectionChange={setLookBack}
            />
          )}

          {/* Periodic */}
          {goalType === "periodic" && (
            <View>
              <MenuPickerRow
                label={t("frequency")}
                selection={periodicPeriod}
                options={PERIOD_OPTION_KEYS.map((o) => ({
                  value: o.value as typeof periodicPeriod,
                  label: t(o.key as any),
                }))}
                onSelectionChange={setPeriodicPeriod}
              />
              <Divider inset />
              <MenuPickerRow
                label={t("every")}
                selection={periodicInterval}
                options={Array.from({ length: 12 }, (_, i) => ({
                  value: i + 1,
                  label: `${i + 1}`,
                }))}
                onSelectionChange={setPeriodicInterval}
              />
              <Divider inset />
              <DateRow
                label={t("startingDate")}
                date={periodicStart ?? new Date()}
                show={showPeriodicStartPicker}
                onToggle={() => setShowPeriodicStartPicker(!showPeriodicStartPicker)}
                onDateChange={setPeriodicStart}
              />
              {periodicStart && (
                <Pressable
                  onPress={() => setPeriodicStart(null)}
                  style={{ padding: spacing.md, paddingTop: 0 }}
                >
                  <Text variant="captionSm" color={colors.primary}>
                    {t("clearStartDate")}
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Spend */}
          {goalType === "spend" && (
            <View>
              <DateRow
                label={t("startingFrom")}
                date={spendFromDate}
                show={showSpendFromPicker}
                onToggle={() => setShowSpendFromPicker(!showSpendFromPicker)}
                onDateChange={setSpendFromDate}
              />
              <Divider inset />
              <DateRow
                label={t("spendBy")}
                date={spendToDate}
                show={showSpendToPicker}
                onToggle={() => setShowSpendToPicker(!showSpendToPicker)}
                onDateChange={setSpendToDate}
              />
              <Divider inset />
              <ToggleRow
                label={t("repeatAnnually")}
                value={spendRepeat}
                onValueChange={setSpendRepeat}
              />
            </View>
          )}

          {/* Percentage */}
          {goalType === "percentage" && (
            <View>
              <MenuPickerRow
                label={t("percentage")}
                selection={percent}
                options={[5, 10, 15, 20, 25, 30, 40, 50, 75, 100].map((v) => ({
                  value: v,
                  label: `${v}%`,
                }))}
                onSelectionChange={setPercent}
              />
              <Divider inset />
              <MenuPickerRow
                label={t("ofIncomeFrom")}
                selection={percentCategory}
                options={[
                  { value: "all-income", label: t("allIncome") },
                  ...incomeCategories.map((c) => ({ value: c.id, label: c.name })),
                ]}
                onSelectionChange={setPercentCategory}
              />
              <Divider inset />
              <ToggleRow
                label={t("useLastMonth")}
                value={percentPrevious}
                onValueChange={setPercentPrevious}
              />
            </View>
          )}

          {/* Remainder */}
          {goalType === "remainder" && (
            <View>
              <MenuPickerRow
                label={t("weight")}
                selection={weight}
                options={Array.from({ length: 10 }, (_, i) => ({
                  value: i + 1,
                  label: `${i + 1}`,
                }))}
                onSelectionChange={setWeight}
              />
            </View>
          )}

          {/* Limit */}
          {goalType === "limit" && (
            <View>
              <View style={{ padding: spacing.md }}>
                <Text
                  variant="caption"
                  color={colors.textMuted}
                  style={{ marginBottom: spacing.sm }}
                >
                  {t("resetPeriod")}
                </Text>
                <Host matchContents>
                  <Picker
                    selection={limitPeriod}
                    onSelectionChange={(val) => setLimitPeriod(val as typeof limitPeriod)}
                    modifiers={[pickerStyle("segmented"), tint(colors.primary)]}
                  >
                    {LIMIT_PERIOD_OPTION_KEYS.map((opt) => (
                      <SwiftText key={opt.value} modifiers={[tag(opt.value)]}>
                        {t(opt.key as any)}
                      </SwiftText>
                    ))}
                  </Picker>
                </Host>
              </View>
              <Divider inset />
              <ToggleRow label={t("keepSurplus")} value={limitHold} onValueChange={setLimitHold} />
            </View>
          )}
        </Card>

        {/* ── Section footers (outside card per Apple HIG) ────── */}
        {goalType === "simple" && (
          <Text
            variant="captionSm"
            color={
              capEnabled && capCents > 0 && capCents <= amountCents
                ? colors.negative
                : colors.textMuted
            }
            style={{ paddingHorizontal: spacing.xs, marginTop: spacing.xs }}
          >
            {capEnabled
              ? capCents > 0 && amountCents > 0
                ? capCents <= amountCents
                  ? t("balanceCapMustBeGreater")
                  : t("budgetedUntilReaches", {
                      budgeted: formatBalance(amountCents),
                      cap: formatBalance(capCents),
                    })
                : t("onceBalanceHits")
              : simpleRefill
                ? t("refillDescription")
                : t("fixedMonthlyDescription")}
          </Text>
        )}
        {goalType === "remainder" && (
          <Text
            variant="captionSm"
            color={colors.textMuted}
            style={{ paddingHorizontal: spacing.xs, marginTop: spacing.xs }}
          >
            {t("higherWeightDescription")}
          </Text>
        )}
        {goalType === "limit" && (
          <Text
            variant="captionSm"
            color={colors.textMuted}
            style={{ paddingHorizontal: spacing.xs, marginTop: spacing.xs }}
          >
            {limitHold
              ? t("limitHoldDescription", {
                  limit:
                    amountCents > 0
                      ? "$" + integerToAmount(amountCents)
                      : t("goalTypeLimit").toLowerCase(),
                  period:
                    limitPeriod === "daily"
                      ? t("periodDay")
                      : limitPeriod === "weekly"
                        ? t("periodWeek")
                        : t("periodMonth"),
                })
              : t("limitNoHoldDescription", {
                  period:
                    limitPeriod === "daily"
                      ? t("periodDay")
                      : limitPeriod === "weekly"
                        ? t("periodWeek")
                        : t("periodMonth"),
                })}{" "}
            {t("limitUseMonthlyNote")}
          </Text>
        )}

        {/* ── Save ──────────────────────────────────────────────── */}
        <Button
          title={isEditing ? t("saveTarget") : t("addTarget")}
          onPress={handleSave}
          size="lg"
          disabled={!canSave}
          loading={saving}
          style={{ marginTop: spacing.xl, borderRadius: 999 }}
        />

        {/* ── Delete — separated per HIG ──────────────────────── */}
        {isEditing && (
          <Button
            title={t("removeTarget")}
            buttonStyle="borderless"
            icon="trashOutline"
            danger
            onPress={handleDelete}
            style={{ marginTop: spacing.lg }}
          />
        )}
      </ScrollView>
    </>
  );
}
