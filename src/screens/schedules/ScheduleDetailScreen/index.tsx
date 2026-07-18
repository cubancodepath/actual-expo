import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSelector } from "@tanstack/react-store";
import {
  Button,
  cn,
  PressableFeedback,
  ScrollShadow,
  Select,
  Separator,
  Spinner,
  Surface,
  Switch,
  Typography,
  useThemeColor,
} from "heroui-native";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  CalendarClock,
  ChevronDown,
  CircleCheck,
  Inbox,
  SkipForward,
  Tag,
  Trash2,
} from "lucide-react-native";
import { AmountKeyboard } from "@/ui/amount-keyboard";
import { intToStr, strToInt, todayInt } from "@/lib/date";
import { CloseButton } from "@/ui/CloseButton";
import { LoadingScreen } from "@/ui/LoadingScreen";
import { Amount } from "@/ui/money-entry/Amount";
import { TypeSegment } from "@/ui/money-entry/TypeSegment";
import { FieldRow } from "@/ui/money-entry/FieldRow";
import { AccountField } from "@/ui/money-entry/AccountField";
import { RecurrenceField } from "@/ui/money-entry/RecurrenceField";
import { DateField } from "@/ui/money-entry/DateField";
import { RecurrencePatternField } from "@/ui/money-entry/RecurrencePatternField";
import { useScheduleFormContext } from "./context/ScheduleFormProvider";
import type { AmountOp } from "./hooks/useScheduleForm";

const CARD_OVERLAP = 36;
const AMOUNT_OPS: AmountOp[] = ["is", "isapprox", "isbetween"];

export function ScheduleDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation(["schedules", "transactions"]);
  const [danger, muted, foreground, accent] = useThemeColor([
    "danger",
    "muted",
    "foreground",
    "accent",
  ]);
  const { id } = useLocalSearchParams<{ id: string }>();

  const { form, isHydrating, initialize, actions, submit, isSaving, post, skip, complete, remove } =
    useScheduleFormContext();

  useEffect(() => {
    initialize(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const values = useSelector(form.store, (s) => s.values);
  const [amountEditing, setAmountEditing] = useState(false);
  const [activeAmount, setActiveAmount] = useState<"primary" | "upper">("primary");
  const [opOpen, setOpOpen] = useState(false);

  const heroTint = values.type === "income" ? "bg-success/70" : "bg-muted/15";
  const isBetween = values.amountOp === "isbetween";
  // Outside a range, the hero always edits the primary amount.
  const editingUpper = isBetween && activeAmount === "upper";
  const keyboardValue = editingUpper ? values.amountUpper : values.amount;

  const opLabel: Record<AmountOp, string> = {
    is: t("isExactly"),
    isapprox: t("isApproximately"),
    isbetween: t("isBetween"),
  };
  const opChoices = AMOUNT_OPS.map((op) => ({ value: op, label: opLabel[op] }));
  const selectedOp = opChoices.find((c) => c.value === values.amountOp);

  const focusAmount = (which: "primary" | "upper") => {
    setActiveAmount(which);
    setAmountEditing(true);
  };

  const canSave = !!values.accountId && values.amount !== 0;

  if (isHydrating) return <LoadingScreen onClose={() => router.dismiss()} />;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <AmountKeyboard
        isOpen={amountEditing}
        onOpenChange={setAmountEditing}
        value={keyboardValue}
        onValueChange={(cents) =>
          form.setFieldValue(editingUpper ? "amountUpper" : "amount", cents)
        }
      >
        <ScrollShadow LinearGradientComponent={LinearGradient} className="flex-1">
          <ScrollView
            contentContainerClassName="pb-10"
            contentInsetAdjustmentBehavior="never"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {/* Height is auto (grows with the selector / range pills) and pb clears
                the card overlap (CARD_OVERLAP) so nothing lands under the card. */}
            <View
              className={`items-center gap-2 px-6 pb-12 pt-70 ${heroTint} -mt-56`}
              style={{ borderBottomLeftRadius: 56, borderBottomRightRadius: 56 }}
            >
              <TypeSegment value={values.type} onChange={(ty) => form.setFieldValue("type", ty)} />

              {isBetween ? (
                // Range: two hero amounts side by side (From / To); tapping one
                // focuses it and the keyboard edits it. Each shrinks on its own.
                <View className="w-full flex-row items-start justify-center gap-3">
                  {(["primary", "upper"] as const).map((which) => (
                    <PressableFeedback
                      key={which}
                      className="flex-1"
                      onPress={() => focusAmount(which)}
                    >
                      <View className="items-center">
                        <Typography className="text-xs uppercase tracking-wide text-muted">
                          {which === "primary" ? t("from") : t("to")}
                        </Typography>
                        <Amount
                          value={which === "primary" ? values.amount : values.amountUpper}
                          isEditing={amountEditing && activeAmount === which}
                          baseFontSize={34}
                        />
                      </View>
                    </PressableFeedback>
                  ))}
                </View>
              ) : (
                <AmountKeyboard.Trigger className="w-full">
                  <Amount value={keyboardValue} isEditing={amountEditing} />
                </AmountKeyboard.Trigger>
              )}

              {/* Amount operator (is / approx / between) — a segment-like pill
                  that tints to accent while its menu is open. */}
              <Select
                value={selectedOp}
                isOpen={opOpen}
                onOpenChange={setOpOpen}
                onValueChange={(next) => {
                  const option = Array.isArray(next) ? next[0] : next;
                  if (option) form.setFieldValue("amountOp", option.value as AmountOp);
                }}
              >
                <Select.Trigger variant="unstyled">
                  <View
                    className={cn(
                      "flex-row items-center gap-1.5 rounded-full px-3.5 py-1.5",
                      opOpen ? "bg-accent-soft" : "bg-surface",
                    )}
                  >
                    <Typography
                      className={cn(
                        "text-sm font-medium",
                        opOpen ? "text-accent" : "text-foreground",
                      )}
                    >
                      {selectedOp?.label ?? ""}
                    </Typography>
                    <ChevronDown size={14} color={opOpen ? accent : muted} />
                  </View>
                </Select.Trigger>
                <Select.Portal>
                  <Select.Overlay />
                  <Select.Content presentation="popover" width={220}>
                    {opChoices.map((c) => (
                      <Select.Item key={c.value} value={c.value} label={c.label} />
                    ))}
                  </Select.Content>
                </Select.Portal>
              </Select>
            </View>

            <AmountKeyboard.DismissArea className="gap-2 px-4" style={{ marginTop: -CARD_OVERLAP }}>
              <Surface className="overflow-hidden rounded-2xl">
                <FieldRow
                  icon={Tag}
                  label={t("scheduleName")}
                  value={values.name}
                  placeholder={t("scheduleName")}
                  onPress={() => router.push("/(auth)/schedule/name")}
                />
                <Separator />
                <FieldRow
                  icon={ArrowLeftRight}
                  label={t("payee", { ns: "transactions" })}
                  value={values.payeeName}
                  placeholder={t("noPayee", { ns: "transactions" })}
                  onPress={() => router.push("/(auth)/schedule/payee-select")}
                />
                <Separator />
                <FieldRow
                  icon={Inbox}
                  label={t("category", { ns: "transactions" })}
                  value={values.categoryName}
                  placeholder={t("selectCategory", { ns: "transactions" })}
                  onPress={() => router.push("/(auth)/schedule/category-select")}
                />
                <Separator />
                <AccountField
                  accountId={values.accountId}
                  accountName={values.accountName}
                  onSelect={actions.selectAccount}
                />
                <Separator />
                <RecurrenceField
                  value={values.recurConfig}
                  onChange={(c) => form.setFieldValue("recurConfig", c)}
                />
                {values.recurConfig && values.recurConfig.frequency !== "daily" ? (
                  <>
                    <Separator />
                    <RecurrencePatternField
                      value={values.recurConfig}
                      onChange={(c) => form.setFieldValue("recurConfig", c)}
                    />
                  </>
                ) : null}
                {/* One-time schedule: pick the specific date. */}
                {!values.recurConfig ? (
                  <>
                    <Separator />
                    <DateField
                      value={
                        values.oneTimeDate
                          ? (strToInt(values.oneTimeDate) ?? todayInt())
                          : todayInt()
                      }
                      onChange={(d) => form.setFieldValue("oneTimeDate", intToStr(d))}
                    />
                  </>
                ) : null}
                <Separator />
                <View className="flex-row items-center gap-3 px-4 py-3.5">
                  <CalendarClock size={18} color={muted} />
                  <Typography className="flex-1 text-base text-foreground">
                    {t("autoPostTransaction")}
                  </Typography>
                  <Switch
                    isSelected={values.postsTransaction}
                    onSelectedChange={(v) => form.setFieldValue("postsTransaction", v)}
                  />
                </View>
              </Surface>

              <View className="gap-2">
                <Button onPress={submit} isDisabled={!canSave || isSaving}>
                  {isSaving ? (
                    <Spinner />
                  ) : (
                    <Button.Label>{t("saveChanges", { ns: "transactions" })}</Button.Label>
                  )}
                </Button>
                <Button variant="tertiary" onPress={post}>
                  <ArrowDownToLine size={18} color={foreground} />
                  <Button.Label>{t("postTransactionNow")}</Button.Label>
                </Button>
                <Button variant="tertiary" onPress={skip}>
                  <SkipForward size={18} color={foreground} />
                  <Button.Label>{t("skipNextDate")}</Button.Label>
                </Button>
                <Button variant="tertiary" onPress={complete}>
                  <CircleCheck size={18} color={foreground} />
                  <Button.Label>{t("completeSchedule")}</Button.Label>
                </Button>
                <Button variant="ghost" onPress={remove}>
                  <Trash2 size={18} color={danger} />
                  <Button.Label style={{ color: danger }}>{t("deleteSchedule")}</Button.Label>
                </Button>
              </View>
            </AmountKeyboard.DismissArea>
          </ScrollView>
        </ScrollShadow>

        <View className="absolute left-4 top-4 z-20">
          <CloseButton onPress={() => router.dismiss()} />
        </View>

        <AmountKeyboard.Portal>
          <AmountKeyboard.Panel />
        </AmountKeyboard.Portal>
      </AmountKeyboard>
    </KeyboardAvoidingView>
  );
}
