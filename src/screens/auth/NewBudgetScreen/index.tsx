import { useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Button, FieldError, Input, TextField, Typography, useThemeColor } from "heroui-native";
import { X } from "lucide-react-native";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { createAndLoadBudget } from "@/stores/operations/budgetfiles";

export type NewBudgetMode = "local" | "server";

type Props = {
  mode: NewBudgetMode;
  onCancel?: () => void;
  onComplete?: () => void;
};

/**
 * Minimal "create a new budget" screen: a name input + a Create button. The
 * only thing we need to create a plan is its name. The budget is seeded with
 * the default category groups + dashboard and NO account (accounts are added
 * afterwards, matching upstream). Shared by the (files)/(auth) new-budget
 * routes and the local onboarding picker via the `mode` prop.
 */
export function NewBudgetScreen({ mode, onCancel, onComplete }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("setup");
  const { t: tc } = useTranslation("common");
  const foreground = useThemeColor("foreground");

  const [name, setName] = useState("My Budget");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Skip the seed on retry (e.g. after a server upload failure) — the local
  // budget already exists and re-seeding would duplicate its data.
  const budgetIdRef = useRef("");

  // Own Android's hardware back while the (blocking) operation runs — the
  // overlay swallows JS touches but not the system button, and a fullScreenModal
  // has no dismiss gesture to disable. Same pattern as DialogHost.
  useEffect(() => {
    if (!saving) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [saving]);

  async function handleCreate() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      budgetIdRef.current = await createAndLoadBudget({
        budgetName: name.trim() || "My Budget",
        mode,
        existingBudgetId: budgetIdRef.current || undefined,
      });
      onComplete?.();
    } catch (e) {
      if (__DEV__) console.error("[new-budget] Error:", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader.ScrollArea>
        <ScreenHeader.Body
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3 pt-2">
            <Typography className="text-lg font-semibold text-foreground">
              {t("name.heading")}
            </Typography>
            <Typography className="text-sm text-muted">{t("name.subtext")}</Typography>

            <TextField isInvalid={!!error} isDisabled={saving}>
              <Input
                autoFocus
                placeholder={t("name.placeholder")}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  setError(null);
                }}
                onSubmitEditing={handleCreate}
                returnKeyType="done"
              />
              {!!error && <FieldError>{error}</FieldError>}
            </TextField>

            <Button
              variant="primary"
              className="mt-4"
              isDisabled={!name.trim() || saving}
              onPress={handleCreate}
            >
              <Button.Label>{t("createButton")}</Button.Label>
            </Button>
          </View>
        </ScreenHeader.Body>

        <ScreenHeader.Floating>
          <View style={{ height: insets.top }} />
          <ScreenHeader>
            {/* Close (X), not a back chevron — the app's affordance for a
                fullScreenModal (same as SettingsScreen). */}
            <ScreenHeader.Back>
              <Button
                variant="secondary"
                isIconOnly
                className="rounded-full"
                isDisabled={saving}
                onPress={onCancel}
                accessibilityLabel={tc("cancel")}
              >
                <X size={24} color={foreground} />
              </Button>
            </ScreenHeader.Back>
            <ScreenHeader.Title>{t("title")}</ScreenHeader.Title>
          </ScreenHeader>
        </ScreenHeader.Floating>
      </ScreenHeader.ScrollArea>
    </View>
  );
}
