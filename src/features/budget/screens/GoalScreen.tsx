import { Pressable, ScrollView, Switch, View } from "react-native";
import { Icon } from "@/design-system/atoms/Icon";
import { Stack } from "expo-router";
import { Host, DatePicker, Picker, Text as SwiftText } from "@expo/ui/swift-ui";
import { useTranslation } from "react-i18next";
import { datePickerStyle, frame, pickerStyle, tag, tint } from "@expo/ui/swift-ui/modifiers";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { Text } from "@/design-system/atoms/Text";
import { Button } from "@/design-system/atoms/Button";
import { Card } from "@/design-system/atoms/Card";
import { ListItem } from "@/design-system/molecules/ListItem";
import { Divider } from "@/design-system/atoms/Divider";
import { CurrencyInput } from "@/features/transactions/components/currency-input";
import { integerToAmount } from "@/core/domain/goals/engine";
import { formatDateLong } from "@/lib/date";
import { formatBalance } from "@/lib/format";
import {
  useGoalEditor,
  type GoalType,
  AVG_VALUES,
  dateToInt,
} from "@/features/budget/hooks/useGoalEditor";

// ---------------------------------------------------------------------------
// Render-only option lists (label keys resolved via i18n at render time)
// ---------------------------------------------------------------------------

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
// Screen
// ---------------------------------------------------------------------------

export interface GoalScreenProps {
  categoryId: string;
  dismissCount?: string;
}

export function GoalScreen({ categoryId, dismissCount }: GoalScreenProps) {
  const { t } = useTranslation("budget");
  const { colors, spacing } = useTheme();

  const {
    isEditing,
    saving,
    canSave,
    currencyInputRef,
    incomeCategories,
    dismiss,
    handleSave,
    handleDelete,
    goalType,
    setGoalType,
    amountCents,
    setAmountCents,
    simpleRefill,
    setSimpleRefill,
    capEnabled,
    setCapEnabled,
    capCents,
    setCapCents,
    targetDate,
    setTargetDate,
    showDatePicker,
    setShowDatePicker,
    byRepeat,
    setByRepeat,
    avgIndex,
    setAvgIndex,
    lookBack,
    setLookBack,
    periodicPeriod,
    setPeriodicPeriod,
    periodicInterval,
    setPeriodicInterval,
    periodicStart,
    setPeriodicStart,
    showPeriodicStartPicker,
    setShowPeriodicStartPicker,
    spendFromDate,
    setSpendFromDate,
    spendToDate,
    setSpendToDate,
    showSpendFromPicker,
    setShowSpendFromPicker,
    showSpendToPicker,
    setShowSpendToPicker,
    spendRepeat,
    setSpendRepeat,
    percent,
    setPercent,
    percentCategory,
    setPercentCategory,
    percentPrevious,
    setPercentPrevious,
    weight,
    setWeight,
    limitPeriod,
    setLimitPeriod,
    limitHold,
    setLimitHold,
  } = useGoalEditor({ categoryId, dismissCount });

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
