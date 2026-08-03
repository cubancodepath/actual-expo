import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  LinearTransition,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useSelector } from "@tanstack/react-store";
import { Button, Separator, Spinner, Surface, Typography, useThemeColor } from "heroui-native";
import { ArrowLeftRight, Inbox, Trash2, X } from "lucide-react-native";
import { AmountKeyboard } from "@/ui/amount-keyboard";
import { useTransactionForm } from "./context/TransactionFormProvider";
import type { NewTransactionParams } from "./hooks/useNewTransactionForm";
import { isSplitLines } from "./validation/transactionForm.schema";
import { Amount } from "@/ui/money-entry/Amount";
import { TypeSegment } from "@/ui/money-entry/TypeSegment";
import { DateField } from "@/ui/money-entry/DateField";
import { NotesField } from "./components/NotesField";
import { ClearedField } from "./components/ClearedField";
import { FieldRow } from "@/ui/money-entry/FieldRow";
import { AccountField } from "@/ui/money-entry/AccountField";
import { RecurrenceField } from "@/ui/money-entry/RecurrenceField";
import { RecurrencePatternField } from "@/ui/money-entry/RecurrencePatternField";
import { useHeaderActionOptions } from "@/ui/header-actions/useHeaderActionOptions";
import type { HeaderAction } from "@/ui/header-actions/types";
import { LoadingScreen } from "@/ui/LoadingScreen";

const CARD_OVERLAP = 36;

// The hero is 448 tall pulled up 224, so ~224px of it are visible, and its
// `pt-70` puts the amount around y≈56-180. Fading the title across this band
// hands it over just as the amount slides under the bar.
const TITLE_FADE_START = 80;
const TITLE_FADE_END = 140;

export function NewTransactionScreen() {
  const router = useRouter();
  const { t } = useTranslation("transactions");
  const { t: tc } = useTranslation("common");
  const [danger, accentForeground] = useThemeColor(["danger", "accent-foreground"]);

  const { form, isEdit, isHydrating, initialize, actions, submit, remove, isSaving } =
    useTransactionForm();

  // This leaf owns the URL: unlike the provider (which mounts before the leaf
  // and would read the previous route's global params), useLocalSearchParams
  // here is populated synchronously from this route's own params. Seed once —
  // pushing pickers changes the URL but must never re-initialize the form.
  const params = useLocalSearchParams() as NewTransactionParams;
  // The guard belongs here, not in the provider: the provider spans the whole
  // stack and outlives this screen, so a guard living there would also block
  // the NEXT `new` screen pushed onto the same stack — which is how a shortcut
  // fired over an open editor used to inherit its state. Once per instance is
  // exactly right; the ref only covers StrictMode's double-invoke in dev.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    initialize(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const values = useSelector(form.store, (s) => s.values);
  const canSubmit = useSelector(form.store, (s) => s.canSubmit);

  // The amount uses our in-app numeric keyboard instead of the system one.
  // Create: open from the start — the amount is the first thing you type.
  // Edit: keep it closed; you usually came to tweak some other field.
  const [amountEditing, setAmountEditing] = useState(() => !params.transactionId);

  // The bar carries no title at rest — the hero already says what this is. It
  // fades in as the hero scrolls away. Driven by a shared value so the whole
  // thing runs on the UI thread: `headerTitle` mounts a real RN view inside the
  // native header, so re-rendering it (or calling setOptions) per scroll frame
  // would commit native props every frame and drop them.
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [TITLE_FADE_START, TITLE_FADE_END],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const titleText = isEdit ? t("editTransaction") : t("newTransaction");

  const headerTitle = useCallback(
    () => (
      <Animated.View style={titleStyle}>
        <Typography className="text-lg font-semibold text-foreground" numberOfLines={1}>
          {titleText}
        </Typography>
      </Animated.View>
    ),
    [titleStyle, titleText],
  );

  const closeAction = useMemo<HeaderAction>(
    () => ({
      label: tc("close"),
      icon: { sfSymbol: "xmark", lucide: X },
      onPress: () => router.dismiss(),
    }),
    [tc, router],
  );
  const actionOptions = useHeaderActionOptions({ left: closeAction });

  const headerOptions = useMemo<NativeStackNavigationOptions>(
    () => ({ ...actionOptions, headerTitle }),
    [actionOptions, headerTitle],
  );

  const heroTint = values.type === "income" ? "bg-success/70" : "bg-muted/15";
  const split = isSplitLines(values.splitLines);
  const splitSummary = split ? t("splitCategories", { count: values.splitLines?.length ?? 0 }) : "";

  // Edit mode gates on hydration so the form (and the amount keyboard's buffer)
  // mounts already holding the transaction — no blank flash, no stale resets.
  if (isHydrating) {
    return <LoadingScreen onClose={() => router.dismiss()} />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <Stack.Screen options={headerOptions} />

      <AmountKeyboard
        isOpen={amountEditing}
        onOpenChange={setAmountEditing}
        value={values.amount}
        onValueChange={(cents) => form.setFieldValue("amount", cents)}
      >
        <View className="flex-1">
          <Animated.ScrollView
            contentContainerClassName="pb-10"
            // Stays "never": the hero is built to bleed up under the
            // transparent header (-mt-56 pt-70), so the content must keep
            // starting at y=0 instead of being inset below the bar.
            contentInsetAdjustmentBehavior="never"
            onScroll={onScroll}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {/* Tinted hero (toggle + amount) scrolls with the content; its curved
              bottom is overlapped by the first card. Top padding clears the
              floating close button. */}
            <View
              className={`items-center gap-2 px-6 pb-5 pt-70 ${heroTint} h-112 -mt-56`}
              style={{
                borderBottomLeftRadius: 56,
                borderBottomRightRadius: 56,
              }}
            >
              <TypeSegment value={values.type} onChange={(ty) => form.setFieldValue("type", ty)} />
              <AmountKeyboard.Trigger className="w-full">
                <Amount value={values.amount} isEditing={amountEditing} />
              </AmountKeyboard.Trigger>
            </View>

            <AmountKeyboard.DismissArea className="gap-2 px-4" style={{ marginTop: -CARD_OVERLAP }}>
              <Surface className="overflow-hidden rounded-2xl">
                <FieldRow
                  icon={ArrowLeftRight}
                  label={t("payee")}
                  value={values.payeeName}
                  placeholder={t("noPayee")}
                  onPress={() => router.push("/(auth)/transaction/payee-select")}
                />
                <Separator />
                <FieldRow
                  icon={Inbox}
                  label={t("category")}
                  value={split ? splitSummary : values.categoryName}
                  placeholder={values.isTransfer ? t("noCategoryNeeded") : t("selectCategory")}
                  disabled={values.isTransfer}
                  onPress={() =>
                    // Already split → go straight to the split editor (with its
                    // categories); otherwise open the category picker.
                    split
                      ? router.push({
                          pathname: "/(auth)/transaction/split-amounts",
                          params: {
                            ids: (values.splitLines ?? [])
                              .map((l) => l.categoryId)
                              .filter(Boolean)
                              .join(","),
                          },
                        })
                      : router.push("/(auth)/transaction/category-select")
                  }
                />
                <Separator />
                <AccountField
                  accountId={values.accountId}
                  accountName={values.accountName}
                  onSelect={actions.selectAccount}
                />
                <Separator />
                <DateField value={values.date} onChange={(d) => form.setFieldValue("date", d)} />
              </Surface>

              <NotesField
                value={values.notes}
                onChangeText={(n) => form.setFieldValue("notes", n)}
              />

              <Surface className="overflow-hidden rounded-2xl">
                <ClearedField
                  value={values.cleared}
                  onValueChange={(v) => form.setFieldValue("cleared", v)}
                />
                {!isEdit ? (
                  <>
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
                  </>
                ) : null}
              </Surface>

              <View className="gap-2">
                <Button
                  layout={LinearTransition.springify()}
                  onPress={submit}
                  isDisabled={!canSubmit || isSaving}
                >
                  {isSaving && <Spinner size="sm" color={accentForeground} />}
                  <Button.Label>{isEdit ? t("saveChanges") : t("addTransaction")}</Button.Label>
                </Button>
                {isEdit ? (
                  <Button variant="ghost" onPress={remove}>
                    <Trash2 size={18} color={danger} />
                    <Button.Label style={{ color: danger }}>{t("deleteTransaction")}</Button.Label>
                  </Button>
                ) : null}
              </View>
            </AmountKeyboard.DismissArea>
          </Animated.ScrollView>
        </View>

        <AmountKeyboard.Portal>
          <AmountKeyboard.Panel />
        </AmountKeyboard.Portal>
      </AmountKeyboard>
    </KeyboardAvoidingView>
  );
}
