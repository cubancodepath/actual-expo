import { useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, Label, Typography, useThemeColor } from "heroui-native";
import { Check, X } from "lucide-react-native";
import { holdForNextMonth } from "@/core/domain/budgets";
import { formatCents } from "@/lib/currency";
import { AmountKeyboard } from "@/ui/amount-keyboard";
import { AmountField } from "@/ui/money-entry/AmountField";
import { ScreenHeader } from "@/ui/ScreenHeader";

/**
 * Reserve leftover To Budget money for next month — a compact modal shaped like
 * the rename sheet: our header (close left, a round check to confirm right) over
 * a single amount field built by hand so it can carry the blinking cursor. The
 * in-app keypad slides up from the bottom (it opens on entry and the pad's ✓
 * dismisses it), the same amount-field behaviour as the goal editor.
 * `holdForNextMonth` clamps to what's actually available; prefilled with the
 * whole To Budget (desktop behaviour).
 */
export function HoldScreen() {
  const { t } = useTranslation("budget");
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const accentForeground = useThemeColor("accent-foreground");
  const { month, toBudget } = useLocalSearchParams<{ month: string; toBudget: string }>();

  const toBudgetCents = Math.max(Number(toBudget), 0);
  const [amount, setAmount] = useState(toBudgetCents);
  const [amountOpen, setAmountOpen] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleHold = async () => {
    if (amount === 0 || saving) return;
    setSaving(true);
    try {
      await holdForNextMonth(month, amount, Number(toBudget));
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AmountKeyboard
      isOpen={amountOpen}
      onOpenChange={setAmountOpen}
      value={amount}
      onValueChange={setAmount}
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
          <ScreenHeader.Title>{t("holdForNextMonth")}</ScreenHeader.Title>
          <ScreenHeader.Actions>
            <Button
              isIconOnly
              className="rounded-full"
              isDisabled={amount === 0 || saving}
              onPress={handleHold}
            >
              <Check size={22} color={accentForeground} />
            </Button>
          </ScreenHeader.Actions>
        </ScreenHeader>

        {/* Everything below the field is a dismiss zone: a tap here (the empty
            space or the caption) closes the pad, the real-keyboard behaviour. */}
        <AmountKeyboard.DismissArea className="flex-1">
          <View className="gap-1 px-4">
            <Label>{t("holdAmountLabel")}</Label>
            <AmountField />
            <Typography className="ml-1 mt-1 text-xs text-muted">
              {t("availableToHold")}
              {formatCents(toBudgetCents)}
            </Typography>
          </View>
        </AmountKeyboard.DismissArea>
      </View>

      <AmountKeyboard.Portal>
        <AmountKeyboard.Panel />
      </AmountKeyboard.Portal>
    </AmountKeyboard>
  );
}
