import { useState } from "react";
import { Alert, Platform, ScrollView, Switch } from "react-native";
import * as Sentry from "@sentry/react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text, Card, ListItem, SectionHeader, Button } from "@/presentation/components";
import { usePrefsStore } from "@/stores/prefsStore";
import { resetAllStores } from "@/stores/resetStores";
import { useSyncStore } from "@/stores/syncStore";
import { usePrivacyStore } from "@/stores/privacyStore";
import { resetSyncState, clearSwitchingFlag, loadClock } from "@/sync";
import { clearLocalData } from "@/db";
import { closeBudget } from "@/services/budgetfiles";
import type { Theme } from "@/theme";

const ICON_SIZE = 20;

function SettingsIcon({
  sfSymbol,
  ionIcon,
  color,
}: {
  sfSymbol: SFSymbol;
  ionIcon: keyof typeof Ionicons.glyphMap;
  color: string;
}) {
  if (Platform.OS === "ios") {
    return <SymbolView name={sfSymbol} size={ICON_SIZE} tintColor={color} />;
  }
  return <Ionicons name={ionIcon} size={ICON_SIZE} color={color} />;
}

function ServerRow({
  label,
  value,
  sfSymbol,
  ionIcon,
  showSeparator,
}: {
  label: string;
  value: string;
  sfSymbol: SFSymbol;
  ionIcon: keyof typeof Ionicons.glyphMap;
  showSeparator?: boolean;
}) {
  const { colors, spacing } = useTheme();
  return (
    <ListItem
      title={label}
      left={<SettingsIcon sfSymbol={sfSymbol} ionIcon={ionIcon} color={colors.textMuted} />}
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
  const { privacyMode, toggle: togglePrivacy } = usePrivacyStore();
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
          left={
            <SettingsIcon
              sfSymbol="gearshape"
              ionIcon="settings-outline"
              color={colors.textMuted}
            />
          }
          showChevron
          onPress={() => router.push("/(auth)/settings/budget")}
          showSeparator
          separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
        />
        <ListItem
          title={t("newBudget")}
          left={
            <SettingsIcon
              sfSymbol="plus.circle"
              ionIcon="add-circle-outline"
              color={colors.textMuted}
            />
          }
          showChevron
          onPress={() => router.push("/(auth)/new-budget")}
          showSeparator
          separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
        />
        <ListItem
          title={t("openBudget")}
          left={
            <SettingsIcon sfSymbol="folder" ionIcon="folder-outline" color={colors.textMuted} />
          }
          showChevron
          onPress={() => router.push("/(auth)/change-budget")}
        />
      </Card>

      {/* App */}
      <SectionHeader title={t("app")} style={{ marginTop: spacing.xl }} />
      <Card>
        <ListItem
          title={t("display")}
          left={
            <SettingsIcon
              sfSymbol="paintbrush"
              ionIcon="color-palette-outline"
              color={colors.textMuted}
            />
          }
          showChevron
          onPress={() => router.push("/(auth)/settings/display")}
          showSeparator
          separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
        />
        <ListItem
          title={t("language")}
          left={<SettingsIcon sfSymbol="globe" ionIcon="globe-outline" color={colors.textMuted} />}
          showChevron
          onPress={() => router.push("/(auth)/settings/language")}
          showSeparator
          separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
        />
        <ListItem
          title={t("hideAmounts")}
          subtitle={t("hideAmountsDescription")}
          left={
            <SettingsIcon sfSymbol="eye.slash" ionIcon="eye-off-outline" color={colors.textMuted} />
          }
          onPress={togglePrivacy}
          right={
            <Switch
              value={privacyMode}
              onValueChange={togglePrivacy}
              trackColor={{ true: colors.primary }}
              accessibilityLabel={t("hideAmounts")}
            />
          }
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
              left={
                <SettingsIcon
                  sfSymbol="iphone"
                  ionIcon="phone-portrait-outline"
                  color={colors.textMuted}
                />
              }
              showSeparator
              separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
            />
            <ListItem
              title={t("connectToServer")}
              subtitle={t("connectToServerDescription")}
              left={
                <SettingsIcon
                  sfSymbol="server.rack"
                  ionIcon="server-outline"
                  color={colors.textMuted}
                />
              }
              showChevron
              onPress={handleConnectToServer}
              showSeparator
              separatorInsetLeft={spacing.lg + ICON_SIZE + spacing.md}
            />
            <ListItem
              title={t("deleteAllData")}
              titleColor={colors.negative}
              left={
                <SettingsIcon sfSymbol="trash" ionIcon="trash-outline" color={colors.negative} />
              }
              onPress={handleDeleteLocal}
            />
          </Card>
        </>
      ) : (
        <>
          <SectionHeader title={t("server")} style={{ marginTop: spacing.xl }} />
          <Card>
            <ServerRow
              label={t("url")}
              value={serverUrl}
              sfSymbol="link"
              ionIcon="link-outline"
              showSeparator
            />
            <ServerRow
              label={t("lastSync")}
              value={lastSyncText}
              sfSymbol="arrow.triangle.2.circlepath"
              ionIcon="sync-outline"
              showSeparator
            />
            <ServerRow
              label={t("fileId")}
              value={fileId ? `${fileId.slice(0, 8)}…` : ""}
              sfSymbol="doc"
              ionIcon="document-outline"
              showSeparator
            />
            <ServerRow
              label={t("groupId")}
              value={groupId ? `${groupId.slice(0, 8)}…` : ""}
              sfSymbol="person.2"
              ionIcon="people-outline"
              showSeparator
            />
            {encryptKeyId && (
              <ServerRow
                label={t("encryption")}
                value={`${encryptKeyId.slice(0, 8)}…`}
                sfSymbol="lock.shield"
                ionIcon="shield-checkmark-outline"
              />
            )}
          </Card>
          <Button
            title={t("disconnectFromServer")}
            icon="log-out-outline"
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
              left={<SettingsIcon sfSymbol="ant" ionIcon="bug-outline" color={colors.warning} />}
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
