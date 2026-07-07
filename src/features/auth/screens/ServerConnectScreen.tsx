import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { withUniwind } from "uniwind";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import { Button, Input, Spinner, Typography, useThemeColor } from "heroui-native";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { useUiPrefsStore } from "@/stores/uiPrefsStore";
import { useServerProbe } from "@/features/auth/hooks/useServerProbe";
import { AuthShell } from "@/features/auth/components/AuthShell";

WebBrowser.maybeCompleteAuthSession();

const StyledIonicons = withUniwind(Ionicons);

/** Step 1: connect to a server (or continue without one). */
export function ServerConnectScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const { serverUrl, setServerUrl, probing, probe } = useServerProbe();
  const accent = useThemeColor("accent");

  function handleUseWithoutServer() {
    // Clear any stale budget state so the user doesn't auto-open an old budget.
    useBudgetContextStore.getState().setBudgetContext({
      activeBudgetId: "",
      fileId: "",
      groupId: "",
      encryptKeyId: undefined,
      lastSyncedTimestamp: undefined,
      budgetName: undefined,
    });
    router.push("/(public)/local-setup");
  }

  return (
    <AuthShell>
      <Typography
        type="body-xs"
        weight="semibold"
        color="muted"
        className="uppercase tracking-wide mt-2 ml-1"
      >
        {t("serverUrl")}
      </Typography>
      <View className="flex-row items-center">
        <Input
          testID="server-url-input"
          placeholder={t("serverUrlPlaceholder")}
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={probe}
          editable={!probing}
          className="flex-1 pl-10"
        />
        <StyledIonicons
          name="server-outline"
          size={16}
          className="absolute left-3.5 text-muted"
          pointerEvents="none"
        />
      </View>

      {probing && (
        <View className="flex-row items-center gap-2 mt-2 justify-center">
          <Spinner size="sm" color={accent} />
          <Typography type="body-sm" color="muted">
            {t("connecting")}
          </Typography>
        </View>
      )}

      <Button
        variant="primary"
        onPress={probe}
        isDisabled={!serverUrl.trim() || probing}
        className="mt-4"
      >
        <Button.Label>{t("continue")}</Button.Label>
      </Button>

      <Pressable onPress={handleUseWithoutServer} className="mt-8 self-center">
        <Typography type="body-sm" color="muted">
          {t("useWithoutServer")}
        </Typography>
      </Pressable>
    </AuthShell>
  );
}
