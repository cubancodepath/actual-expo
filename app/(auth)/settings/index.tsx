import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import * as Sentry from "@sentry/react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import {
  Text,
  Card,
  ListItem,
  SectionHeader,
  Button,
  Icon,
  type IconName,
} from "@/presentation/components";
import { usePrefsStore } from "@/stores/prefsStore";
import { resetAllStores } from "@/stores/resetStores";
import { useSyncStore } from "@/stores/syncStore";
import { resetSyncState, clearSwitchingFlag, loadClock } from "@/sync";
import { clearLocalData } from "@/db";
import { closeBudget } from "@/services/budgetfiles";
import type { Theme } from "@/theme";

const ICON_SIZE = 20;

function SettingsIcon({ name, color }: { name: IconName; color: string }) {
  return <Icon name={name} size={ICON_SIZE} color={color} />;
}

function ServerRow({
  label,
  value,
  icon,
  showSeparator,
}: {
  label: string;
  value: string;
  icon: IconName;
  showSeparator?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <ListItem
      title={label}
      left={<SettingsIcon name={icon} color={colors.textMuted} />}
      right={
        <Text variant="bodySm" color={colors.textSecondary} numberOfLines={1}>
          {value || "—"}
        </Text>
      }
      showSeparator={showSeparator}
      separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
    />
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");

  const {
    serverUrl,
    fileId,
    groupId,
    encryptKeyId,
    budgetName,
    lastSyncedTimestamp,
    isLocalOnly,
    clearAll,
  } = usePrefsStore();
  const lastSync = useSyncStore((s) => s.lastSync);
  const [loggingOut, setLoggingOut] = useState(false);

  const lastSyncText = lastSync
    ? lastSync.toLocaleTimeString()
    : lastSyncedTimestamp
      ? lastSyncedTimestamp.slice(0, 16)
      : tc("never");

  function handleDeleteLocal() {
    Alert.alert(t("deleteAllData"), t("deleteAllDataMessage"), [
      { text: tc("cancel"), style: "cancel" },
      {
        text: tc("delete"),
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          try {
            resetSyncState();
            resetAllStores();
            await clearAll();
            await clearLocalData();
            await loadClock();
          } finally {
            clearSwitchingFlag();
            setLoggingOut(false);
          }
        },
      },
    ]);
  }

  async function handleConnectToServer() {
    await closeBudget();
    await clearAll();
  }

  function handleLogout() {
    Alert.alert(t("disconnectTitle"), t("disconnectMessage"), [
      { text: tc("cancel"), style: "cancel" },
      {
        text: tc("disconnect"),
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          try {
            resetSyncState();
            resetAllStores();
            await clearAll();
            await clearLocalData();
            await loadClock();
          } finally {
            clearSwitchingFlag();
            setLoggingOut(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* Budget */}
      <SectionHeader title={t("currentBudget")} style={{ marginTop: spacing.lg }} />
      <Text
        variant="headingLg"
        color={colors.textPrimary}
        style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}
      >
        {budgetName || t("defaultBudgetName")}
      </Text>
      <Card>
        <ListItem
          title={t("budgetSettings")}
          left={<SettingsIcon name="settingsOutline" color={colors.textMuted} />}
          showChevron
          onPress={() => router.push("/(auth)/settings/budget")}
          showSeparator
          separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
        />
        <ListItem
          title={t("newBudget")}
          left={<SettingsIcon name="addCircleOutline" color={colors.textMuted} />}
          showChevron
          onPress={() => router.push("/(auth)/new-budget")}
          showSeparator
          separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
        />
        <ListItem
          title={t("openBudget")}
          left={<SettingsIcon name="folderOutline" color={colors.textMuted} />}
          showChevron
          onPress={() => router.push("/(auth)/change-budget")}
        />
      </Card>

      {/* App */}
      <SectionHeader title={t("app")} style={{ marginTop: spacing.xl }} />
      <Card>
        <ListItem
          title={t("display")}
          left={<SettingsIcon name="colorPaletteOutline" color={colors.textMuted} />}
          showChevron
          onPress={() => router.push("/(auth)/settings/display")}
          showSeparator
          separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
        />
        <ListItem
          title={t("language")}
          left={<SettingsIcon name="globeOutline" color={colors.textMuted} />}
          showChevron
          onPress={() => router.push("/(auth)/settings/language")}
        />
      </Card>

      {/* Server / Mode */}
      {isLocalOnly ? (
        <>
          <SectionHeader title={t("mode")} style={{ marginTop: spacing.xl }} />
          <Card>
            <ListItem
              title={t("localOnly")}
              subtitle={t("localOnlyDescription")}
              left={<SettingsIcon name="phonePortraitOutline" color={colors.textMuted} />}
              showSeparator
              separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
            />
            <ListItem
              title={t("connectToServer")}
              subtitle={t("connectToServerDescription")}
              left={<SettingsIcon name="serverOutline" color={colors.textMuted} />}
              showChevron
              onPress={handleConnectToServer}
              showSeparator
              separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
            />
            <ListItem
              title={t("deleteAllData")}
              titleColor={colors.negative}
              left={<SettingsIcon name="trashOutline" color={colors.negative} />}
              onPress={handleDeleteLocal}
            />
          </Card>
        </>
      ) : (
        <>
          <SectionHeader title={t("server")} style={{ marginTop: spacing.xl }} />
          <Card>
            <ServerRow label={t("url")} value={serverUrl} icon="linkOutline" showSeparator />
            <ServerRow
              label={t("lastSync")}
              value={lastSyncText}
              icon="syncOutline"
              showSeparator
            />
            <ServerRow
              label={t("fileId")}
              value={fileId ? `${fileId.slice(0, 8)}…` : ""}
              icon="documentOutline"
              showSeparator
            />
            <ServerRow
              label={t("groupId")}
              value={groupId ? `${groupId.slice(0, 8)}…` : ""}
              icon="peopleOutline"
              showSeparator
            />
            {encryptKeyId && (
              <ServerRow
                label={t("encryption")}
                value={`${encryptKeyId.slice(0, 8)}…`}
                icon="lockShieldOutline"
              />
            )}
          </Card>
          <Button
            title={t("disconnectFromServer")}
            icon="logOutOutline"
            variant="ghost"
            textColor={colors.negative}
            onPress={handleLogout}
            style={{ marginTop: spacing.md }}
          />
        </>
      )}

      {/* Debug: Sentry test */}
      {__DEV__ && (
        <>
          <SectionHeader title="Debug" style={{ marginTop: spacing.xl }} />
          <Card>
            <ListItem
              title="Test Sentry Error"
              left={<SettingsIcon name="bugOutline" color={colors.warning} />}
              onPress={() => {
                Sentry.captureException(new Error("Test error from Settings"));
                Alert.alert("Sentry", "Test error sent! Check your Sentry dashboard.");
              }}
            />
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
  },
});
