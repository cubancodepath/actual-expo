import { LinearTransition } from "react-native-reanimated";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useTranslation } from "react-i18next";
import { Server } from "lucide-react-native";
import { Button, LinkButton, Spinner, useThemeColor } from "heroui-native";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { useServerProbe } from "./hooks/useServerProbe";
import { AuthShell } from "@/screens/auth/components/AuthShell";
import { AuthField } from "@/screens/auth/components/AuthField";

WebBrowser.maybeCompleteAuthSession();

/** Step 1: connect to a server (or continue without one). */
export function ServerConnectScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const { serverUrl, setServerUrl, probing, probe } = useServerProbe();
  const accentForeground = useThemeColor("accent-foreground");

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
      <AuthField
        label={t("serverUrl")}
        icon={Server}
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
      />

      <Button
        variant="primary"
        size="lg"
        layout={LinearTransition.springify()}
        onPress={probe}
        isDisabled={!serverUrl.trim() || probing}
        className="mt-4"
      >
        {probing && <Spinner size="sm" color={accentForeground} />}
        <Button.Label>{t("continue")}</Button.Label>
      </Button>

      <LinkButton size="sm" onPress={handleUseWithoutServer} className="mt-8 self-center">
        <LinkButton.Label className="text-muted">{t("useWithoutServer")}</LinkButton.Label>
      </LinkButton>
    </AuthShell>
  );
}
