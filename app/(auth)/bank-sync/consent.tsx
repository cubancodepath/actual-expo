import { useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text, Button, ErrorBanner } from "@/presentation/components";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import { createGoCardlessWebToken, getGoCardlessAccounts } from "@/bank-sync/service";
import { useTranslation } from "react-i18next";
import type { Theme } from "@/theme";

type ConsentState = "idle" | "opening" | "waiting" | "checking" | "authorized" | "error";

export default function ConsentScreen() {
  const { institutionId, institutionName } = useLocalSearchParams<{
    institutionId: string;
    institutionName: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation("bankSync");
  const { error, handleError, dismissError } = useErrorHandler();

  const [state, setState] = useState<ConsentState>("idle");
  const [requisitionId, setRequisitionId] = useState<string | null>(null);

  async function handleOpenBank() {
    setState("opening");
    await handleError(async () => {
      const { link, requisitionId: reqId } = await createGoCardlessWebToken(institutionId);
      setRequisitionId(reqId);

      setState("waiting");
      await WebBrowser.openBrowserAsync(link);

      // After browser closes, check status
      setState("checking");
      await checkStatus(reqId);
    });
    if (state === "opening" || state === "waiting") setState("idle");
  }

  async function checkStatus(reqId?: string) {
    const id = reqId ?? requisitionId;
    if (!id) return;

    setState("checking");
    await handleError(async () => {
      const result = await getGoCardlessAccounts(id);

      if (result.status === "LN" || result.status === "GA") {
        setState("authorized");
        // Navigate to account selection
        router.push({
          pathname: "/(auth)/bank-sync/accounts",
          params: {
            requisitionId: id,
            institutionName: institutionName ?? "Bank",
          },
        });
      } else if (result.status === "EX") {
        setState("error");
        throw new Error(t("consent.expired"));
      } else if (result.status === "RJ") {
        setState("error");
        throw new Error(t("consent.rejected"));
      } else {
        // Still pending — stay on waiting state
        setState("waiting");
      }
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons
          name="shield-checkmark-outline"
          size={64}
          color={theme.colors.primary}
          style={styles.icon}
        />

        <Text variant="bodyLg" color={theme.colors.textPrimary} style={styles.title}>
          {institutionName}
        </Text>

        <Text variant="body" color={theme.colors.textSecondary} style={styles.description}>
          {state === "waiting" || state === "checking"
            ? t("consent.waitingDescription")
            : t("consent.description")}
        </Text>

        {(state === "checking" || state === "opening") && (
          <ActivityIndicator size="large" color={theme.colors.primary} style={styles.spinner} />
        )}

        {state === "authorized" && (
          <Ionicons
            name="checkmark-circle"
            size={48}
            color={theme.colors.positive}
            style={styles.spinner}
          />
        )}
      </View>

      <ErrorBanner error={error} onDismiss={dismissError} />

      <View style={styles.actions}>
        {(state === "idle" || state === "error") && (
          <Button
            title={t("consent.openBank")}
            onPress={handleOpenBank}
            size="lg"
            icon="open-outline"
          />
        )}

        {state === "waiting" && (
          <Button
            title={t("consent.checkStatus")}
            onPress={() => checkStatus()}
            size="lg"
            icon="refresh-outline"
          />
        )}
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    padding: theme.spacing.xl,
  },
  content: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  icon: {
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontWeight: "600" as const,
    textAlign: "center" as const,
    marginBottom: theme.spacing.sm,
  },
  description: {
    textAlign: "center" as const,
    marginBottom: theme.spacing.xl,
  },
  spinner: {
    marginTop: theme.spacing.lg,
  },
  actions: {
    paddingBottom: theme.spacing.xl,
  },
});
