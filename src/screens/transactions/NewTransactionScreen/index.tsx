import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useSelector } from "@tanstack/react-store";
import { Button, ScrollShadow, Separator, Spinner, Surface, useThemeColor } from "heroui-native";
import { ArrowLeftRight, Trash2, WalletCards } from "lucide-react-native";
import { useTransactionForm } from "./context/TransactionFormProvider";
import { isSplitLines } from "./validation/transactionForm.schema";
import { Amount } from "./components/Amount";
import { TypeSegment } from "./components/TypeSegment";
import { DateField } from "./components/DateField";
import { NotesField } from "./components/NotesField";
import { ClearedField } from "./components/ClearedField";
import { FieldRow } from "./components/FieldRow";
import { AccountField } from "./components/sheets/AccountField";
import { RecurrenceField } from "./components/sheets/RecurrenceField";
import { TagsField } from "./components/sheets/TagsField";
import { CloseButton } from "@/components/CloseButton";

const CARD_OVERLAP = 36;

/**
 * Create / edit a transaction. Built entirely on HeroUI Native (+ Pro),
 * lucide icons, TanStack Form + Zod, and the domain `saveTransaction`.
 *
 * Form state + reference data come from TransactionFormProvider (shared with the
 * payee/category picker screens). Payee and Category are stack screens, not
 * sheets, so their search inputs focus reliably.
 */
export function NewTransactionScreen() {
  const router = useRouter();
  const { t } = useTranslation("transactions");
  const danger = useThemeColor("danger");

  const { form, isEdit, actions, submit, remove, isSaving, tags } = useTransactionForm();

  const values = useSelector(form.store, (s) => s.values);
  const canSubmit = useSelector(form.store, (s) => s.canSubmit);

  const heroTint = values.type === "income" ? "bg-success/70" : "bg-muted/15";
  const split = isSplitLines(values.splitLines);
  const splitSummary = split ? t("splitCategories", { count: values.splitLines?.length ?? 0 }) : "";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-background"
    >
      <ScrollShadow LinearGradientComponent={LinearGradient} className="flex-1">
        <ScrollView
          contentContainerClassName="pb-10"
          contentInsetAdjustmentBehavior="never"
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
            <Amount
              value={values.amount}
              type={values.type}
              onChange={(cents) => form.setFieldValue("amount", cents)}
            />
          </View>

          <View className="gap-2 px-4" style={{ marginTop: -CARD_OVERLAP }}>
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
                icon={WalletCards}
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

            <Surface className="overflow-hidden rounded-2xl p-4">
              <NotesField
                value={values.notes}
                onChangeText={(n) => form.setFieldValue("notes", n)}
              />
            </Surface>

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
                </>
              ) : null}
              <Separator />
              <TagsField
                notes={values.notes}
                tags={tags}
                onChangeNotes={(n) => form.setFieldValue("notes", n)}
              />
            </Surface>

            <View className="gap-2">
              <Button onPress={submit} isDisabled={!canSubmit || isSaving}>
                {isSaving ? (
                  <Spinner />
                ) : (
                  <Button.Label>{isEdit ? t("saveChanges") : t("addTransaction")}</Button.Label>
                )}
              </Button>
              {isEdit ? (
                <Button variant="ghost" onPress={remove}>
                  <Trash2 size={18} color={danger} />
                  <Button.Label style={{ color: danger }}>{t("deleteTransaction")}</Button.Label>
                </Button>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </ScrollShadow>

      {/* Floating close button — top-left, always visible (does not scroll). */}
      <View className="absolute left-4 top-4 z-20">
        <CloseButton onPress={() => router.dismiss()} />
      </View>
    </KeyboardAvoidingView>
  );
}
