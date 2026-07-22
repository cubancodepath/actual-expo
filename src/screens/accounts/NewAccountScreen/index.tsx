import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSelector } from "@tanstack/react-store";
import {
  Button,
  Input,
  Label,
  Spinner,
  Switch,
  TextField,
  Typography,
  useThemeColor,
} from "heroui-native";
import { X } from "lucide-react-native";
import { AmountKeyboard } from "@/ui/amount-keyboard";
import { AmountField } from "@/ui/money-entry/AmountField";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { useNewAccountForm } from "./hooks/useNewAccountForm";

/**
 * Create-account modal: our HeroUI header (close left), a TanStack Form body
 * (name, starting balance, off-budget), and a primary Create button at the
 * bottom. The starting-balance field uses the in-app amount keypad, shaped like
 * the HoldScreen field — the value is stored as an integer cents in the form.
 */
export function NewAccountScreen() {
  const { t } = useTranslation("accounts");
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const { form, submit, isSaving } = useNewAccountForm();

  const values = useSelector(form.store, (s) => s.values);
  const canSubmit = useSelector(form.store, (s) => s.canSubmit);
  const [amountOpen, setAmountOpen] = useState(false);

  return (
    <AmountKeyboard
      isOpen={amountOpen}
      onOpenChange={setAmountOpen}
      value={values.startingBalance}
      onValueChange={(cents) => form.setFieldValue("startingBalance", cents)}
    >
      <View className="flex-1">
        <ScreenHeader>
          <ScreenHeader.Back>
            <Button
              variant="secondary"
              isIconOnly
              className="rounded-full"
              onPress={() => router.back()}
            >
              <X size={24} color={foreground} />
            </Button>
          </ScreenHeader.Back>
          <ScreenHeader.Title>{t("newAccount.title")}</ScreenHeader.Title>
        </ScreenHeader>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentContainerClassName="gap-4 px-4 pt-2 pb-6"
        >
          {/* Account name */}
          <TextField>
            <Label>{t("newAccount.accountNameLabel")}</Label>
            <Input
              value={values.name}
              onChangeText={(txt) => form.setFieldValue("name", txt)}
              placeholder={t("newAccount.accountNamePlaceholder")}
              autoFocus
              returnKeyType="done"
              onFocus={() => setAmountOpen(false)}
            />
          </TextField>

          {/* Starting balance */}
          <View className="gap-1">
            <Label>{t("newAccount.startingBalanceLabel")}</Label>
            <AmountField />
            <Typography className="ml-1 mt-1 text-xs text-muted">
              {t("newAccount.startingBalanceHint")}
            </Typography>
          </View>

          {/* Off budget */}
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Typography className="text-base text-foreground">
                {t("newAccount.offBudget")}
              </Typography>
              <Typography className="text-xs text-muted">
                {t("newAccount.offBudgetDescription")}
              </Typography>
            </View>
            <Switch
              isSelected={values.offbudget}
              onSelectedChange={(v) => form.setFieldValue("offbudget", v)}
            />
          </View>

          {/* Create */}
          <Button className="mt-2" onPress={submit} isDisabled={!canSubmit || isSaving}>
            {isSaving ? <Spinner /> : <Button.Label>{t("newAccount.createAccount")}</Button.Label>}
          </Button>
        </ScrollView>
      </View>

      <AmountKeyboard.Portal>
        <AmountKeyboard.Panel />
      </AmountKeyboard.Portal>
    </AmountKeyboard>
  );
}
