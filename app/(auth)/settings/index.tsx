import { useState } from "react";
import { Alert, Platform, ScrollView, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SymbolView } from "expo-symbols";
import type { SFSymbol } from "sf-symbols-typescript";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, useThemedStyles } from "../../../src/presentation/providers/ThemeProvider";
import {
  Text,
  Card,
  ListItem,
  SectionHeader,
  Divider,
} from "../../../src/presentation/components";
import { usePrefsStore } from "../../../src/stores/prefsStore";
import { resetAllStores } from "../../../src/stores/resetStores";
import { useSyncStore } from "../../../src/stores/syncStore";
import { usePrivacyStore } from "../../../src/stores/privacyStore";
import { resetSyncState, clearSwitchingFlag, loadClock } from "../../../src/sync";
import { clearLocalData } from "../../../src/db";
import type { Theme } from "../../../src/theme";

// Conditionally import SwiftUI Picker on iOS
let SwiftPicker: typeof import('@expo/ui/swift-ui').Picker | null = null;
let SwiftText: typeof import('@expo/ui/swift-ui').Text | null = null;
let Host: typeof import('@expo/ui/swift-ui').Host | null = null;
let tagMod: typeof import('@expo/ui/swift-ui/modifiers').tag | null = null;
let pickerStyleMod: typeof import('@expo/ui/swift-ui/modifiers').pickerStyle | null = null;
let tintMod: typeof import('@expo/ui/swift-ui/modifiers').tint | null = null;

if (Platform.OS === 'ios') {
  try {
    const swiftUI = require('@expo/ui/swift-ui');
    SwiftPicker = swiftUI.Picker;
    SwiftText = swiftUI.Text;
    Host = swiftUI.Host;
    const mods = require('@expo/ui/swift-ui/modifiers');
    tagMod = mods.tag;
    pickerStyleMod = mods.pickerStyle;
    tintMod = mods.tint;
  } catch {
    // Fallback — @expo/ui not available
  }
}

const THEME_OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const ICON_SIZE = 20;

function SettingsIcon({ sfSymbol, ionIcon, color }: { sfSymbol: SFSymbol; ionIcon: keyof typeof Ionicons.glyphMap; color: string }) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={sfSymbol} size={ICON_SIZE} tintColor={color} />;
  }
  return <Ionicons name={ionIcon} size={ICON_SIZE} color={color} />;
}

function InsetDivider() {
  const { spacing } = useTheme();
  return <Divider style={{ marginLeft: spacing.lg + ICON_SIZE + spacing.md }} />;
}

function PickerRow({
  label,
  sfSymbol,
  ionIcon,
  selection,
  options,
  onSelectionChange,
}: {
  label: string;
  sfSymbol: SFSymbol;
  ionIcon: keyof typeof Ionicons.glyphMap;
  selection: string;
  options: { value: string; label: string }[];
  onSelectionChange: (value: string) => void;
}) {
  const { colors } = useTheme();

  const picker =
    SwiftPicker && SwiftText && Host && tagMod && pickerStyleMod ? (
      <Host style={{ width: 140, height: 32 }}>
        <SwiftPicker
          selection={selection}
          onSelectionChange={(val) => onSelectionChange(val as string)}
          modifiers={[pickerStyleMod('menu'), ...(tintMod ? [tintMod(colors.primary)] : [])]}
        >
          {options.map((opt) => (
            <SwiftText key={opt.value} modifiers={[tagMod(opt.value)]}>
              {opt.label}
            </SwiftText>
          ))}
        </SwiftPicker>
      </Host>
    ) : (
      <Text variant="bodySm" color={colors.primary}>
        {options.find((o) => o.value === selection)?.label ?? selection}
      </Text>
    );

  return (
    <ListItem
      title={label}
      left={<SettingsIcon sfSymbol={sfSymbol} ionIcon={ionIcon} color={colors.textMuted} />}
      right={picker}
    />
  );
}

function ServerRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <ListItem
      title={label}
      right={
        <Text
          variant="bodySm"
          color={colors.textSecondary}
          numberOfLines={1}
        >
          {value || "—"}
        </Text>
      }
    />
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const { serverUrl, fileId, groupId, encryptKeyId, budgetName, lastSyncedTimestamp, isLocalOnly, clearAll, setPrefs } =
    usePrefsStore();
  const themeMode = usePrefsStore((s) => s.themeMode);
  const lastSync = useSyncStore((s) => s.lastSync);
  const { privacyMode, toggle: togglePrivacy } = usePrivacyStore();
  const [loggingOut, setLoggingOut] = useState(false);

  const lastSyncText = lastSync
    ? lastSync.toLocaleTimeString()
    : lastSyncedTimestamp
      ? lastSyncedTimestamp.slice(0, 16)
      : "Never";

  function handleDeleteLocal() {
    Alert.alert(
      "Delete All Data",
      "This will permanently delete all your local budget data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
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
      ],
    );
  }

  function handleLogout() {
    Alert.alert(
      "Disconnect",
      "Disconnect from this server? Local data will be cleared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
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
      ],
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      contentInsetAdjustmentBehavior="automatic"
    >
      {/* Budget */}
      <SectionHeader title="Current Budget" style={{ marginTop: spacing.lg }} />
      <Text
        variant="headingLg"
        color={colors.textPrimary}
        style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}
      >
        {budgetName || "My Budget"}
      </Text>
      <Card>
        <ListItem
          title="Budget Settings"
          left={<SettingsIcon sfSymbol="gearshape" ionIcon="settings-outline" color={colors.textMuted} />}
          showChevron
          onPress={() => router.push("/(auth)/settings/budget")}
        />
        <InsetDivider />
        <ListItem
          title="New Budget"
          left={<SettingsIcon sfSymbol="plus.circle" ionIcon="add-circle-outline" color={colors.textMuted} />}
          showChevron
          onPress={() => router.push("/(auth)/new-budget")}
        />
        <InsetDivider />
        <ListItem
          title="Open Budget"
          left={<SettingsIcon sfSymbol="folder" ionIcon="folder-outline" color={colors.textMuted} />}
          showChevron
          onPress={() => router.push("/(auth)/change-budget")}
        />
      </Card>

      {/* App */}
      <SectionHeader title="App" style={{ marginTop: spacing.xl }} />
      <Card>
        <PickerRow
          label="Theme"
          sfSymbol="paintbrush"
          ionIcon="color-palette-outline"
          selection={themeMode}
          options={THEME_OPTIONS}
          onSelectionChange={(v) => setPrefs({ themeMode: v as 'system' | 'light' | 'dark' })}
        />
        <InsetDivider />
        <ListItem
          title="Hide Amounts"
          subtitle="Mask all monetary values for privacy"
          left={<SettingsIcon sfSymbol="eye.slash" ionIcon="eye-off-outline" color={colors.textMuted} />}
          onPress={togglePrivacy}
          right={
            <Switch
              value={privacyMode}
              onValueChange={togglePrivacy}
              trackColor={{ true: colors.primary }}
              accessibilityLabel="Hide monetary amounts"
            />
          }
        />
      </Card>

      {/* Server / Mode */}
      {isLocalOnly ? (
        <>
          <SectionHeader title="Mode" style={{ marginTop: spacing.xl }} />
          <Card>
            <ListItem
              title="Local Only"
              subtitle="Data is stored on this device only"
              left={<SettingsIcon sfSymbol="iphone" ionIcon="phone-portrait-outline" color={colors.textMuted} />}
            />
            <Divider />
            <ListItem
              title="Delete All Data"
              titleColor={colors.negative}
              left={<SettingsIcon sfSymbol="trash" ionIcon="trash-outline" color={colors.negative} />}
              onPress={handleDeleteLocal}
            />
          </Card>
        </>
      ) : (
        <>
          <SectionHeader title="Server" style={{ marginTop: spacing.xl }} />
          <Card>
            <ServerRow label="URL" value={serverUrl} />
            <Divider />
            <ServerRow label="Last Sync" value={lastSyncText} />
            <Divider />
            <ServerRow label="File ID" value={fileId ? `${fileId.slice(0, 8)}…` : ""} />
            <Divider />
            <ServerRow
              label="Group ID"
              value={groupId ? `${groupId.slice(0, 8)}…` : ""}
            />
            {encryptKeyId && (
              <>
                <Divider />
                <ServerRow
                  label="Encryption"
                  value={`${encryptKeyId.slice(0, 8)}…`}
                />
              </>
            )}
            <Divider />
            <ListItem
              title="Disconnect from Server"
              titleColor={colors.negative}
              left={<SettingsIcon sfSymbol="rectangle.portrait.and.arrow.right" ionIcon="log-out-outline" color={colors.negative} />}
              onPress={handleLogout}
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
