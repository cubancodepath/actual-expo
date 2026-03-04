import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles } from "../../src/presentation/providers/ThemeProvider";
import {
  Text,
  Button,
  Card,
  ListItem,
  SectionHeader,
  Divider,
} from "../../src/presentation/components";
import { usePrefsStore } from "../../src/stores/prefsStore";
import { useSyncStore } from "../../src/stores/syncStore";
import { usePreferencesStore } from "../../src/stores/preferencesStore";
import { resetAllStores } from "../../src/stores/resetStores";
import { usePrivacyStore } from "../../src/stores/privacyStore";
import { clearSyncTimeout } from "../../src/sync";
import {
  DATE_FORMAT_OPTIONS,
  NUMBER_FORMAT_OPTIONS,
  DAY_OF_WEEK_OPTIONS,
} from "../../src/preferences/types";
import type { Theme } from "../../src/theme";

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

function PickerRow({
  label,
  selection,
  options,
  onSelectionChange,
}: {
  label: string;
  selection: string;
  options: { value: string; label: string }[];
  onSelectionChange: (value: string) => void;
}) {
  const { colors } = useTheme();

  const picker =
    SwiftPicker && SwiftText && Host && tagMod && pickerStyleMod ? (
      <Host matchContents>
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

  return <ListItem title={label} right={picker} />;
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
          style={{ fontFamily: "monospace" }}
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

  const { serverUrl, fileId, groupId, encryptKeyId, budgetName, lastSyncedTimestamp, clearAll } =
    usePrefsStore();
  const { status, error, lastSync, sync } = useSyncStore();
  const { dateFormat, numberFormat, firstDayOfWeekIdx, hideFraction, set } =
    usePreferencesStore();
  const { privacyMode, toggle: togglePrivacy } = usePrivacyStore();
  const [loggingOut, setLoggingOut] = useState(false);

  const lastSyncText = lastSync
    ? lastSync.toLocaleTimeString()
    : lastSyncedTimestamp
      ? lastSyncedTimestamp.slice(0, 16)
      : "Never";

  const syncButtonTitle =
    status === "success" ? "Sync again" : status === "error" ? "Retry sync" : "Sync now";

  const dateOptions = DATE_FORMAT_OPTIONS.map((o) => ({
    value: o.value,
    label: o.example,
  }));

  const numberOptions = NUMBER_FORMAT_OPTIONS.map((o) => ({
    value: o.value,
    label: o.example,
  }));

  function handleLogout() {
    Alert.alert(
      "Disconnect",
      "Disconnect from this server? Your local data will remain.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setLoggingOut(true);
            try {
              clearSyncTimeout();
              resetAllStores();
              await clearAll();
            } finally {
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
      contentContainerStyle={{ paddingBottom: spacing.xxxl }}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          ),
        }}
      />
      {/* Sync */}
      <SectionHeader title="Sync" style={{ marginTop: spacing.lg }} />
      <Card>
        <ListItem
          title="Last sync"
          right={
            <Text variant="bodySm" color={colors.textSecondary}>
              {lastSyncText}
            </Text>
          }
        />
        {error && (
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
            <Text variant="bodySm" color={colors.negative}>
              {error}
            </Text>
          </View>
        )}
        <View style={{ padding: spacing.md }}>
          <Button
            title={syncButtonTitle}
            onPress={sync}
            loading={status === "syncing"}
            disabled={status === "syncing"}
            variant="primary"
            size="md"
          />
        </View>
      </Card>

      {/* Manage */}
      <SectionHeader title="Manage" style={{ marginTop: spacing.xl }} />
      <Card>
        <ListItem
          title="Payees"
          showChevron
          onPress={() => router.push("/(auth)/payees")}
        />
        <Divider />
        <ListItem
          title="Categories"
          showChevron
          onPress={() => router.push("/(auth)/categories")}
        />
      </Card>

      {/* Formatting */}
      <SectionHeader title="Formatting" style={{ marginTop: spacing.xl }} />
      <Card>
        <PickerRow
          label="Date Format"
          selection={dateFormat}
          options={dateOptions}
          onSelectionChange={(v) => set('dateFormat', v)}
        />
        <Divider />
        <PickerRow
          label="Number Format"
          selection={numberFormat}
          options={numberOptions}
          onSelectionChange={(v) => set('numberFormat', v)}
        />
        <Divider />
        <ListItem
          title="Hide Decimal Places"
          right={
            <Switch
              value={hideFraction === 'true'}
              onValueChange={(v) => set('hideFraction', v ? 'true' : 'false')}
              trackColor={{ true: colors.primary }}
            />
          }
        />
      </Card>

      {/* Calendar */}
      <SectionHeader title="Calendar" style={{ marginTop: spacing.xl }} />
      <Card>
        <PickerRow
          label="First Day of Week"
          selection={firstDayOfWeekIdx}
          options={DAY_OF_WEEK_OPTIONS}
          onSelectionChange={(v) => set('firstDayOfWeekIdx', v)}
        />
      </Card>

      {/* Privacy */}
      <SectionHeader title="Privacy" style={{ marginTop: spacing.xl }} />
      <Card>
        <ListItem
          title="Hide Amounts"
          subtitle="Mask all monetary values for privacy"
          right={
            <Switch
              value={privacyMode}
              onValueChange={togglePrivacy}
              trackColor={{ true: colors.primary }}
            />
          }
        />
      </Card>

      {/* Budget */}
      <SectionHeader title="Budget" style={{ marginTop: spacing.xl }} />
      <Card>
        <ListItem
          title={budgetName || 'Current Budget'}
          subtitle="Tap to switch budget"
          showChevron
          onPress={() => router.push("/(auth)/change-budget")}
        />
      </Card>

      {/* Server */}
      <SectionHeader title="Server" style={{ marginTop: spacing.xl }} />
      <Card>
        <ServerRow label="URL" value={serverUrl} />
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
      </Card>

      {/* Disconnect */}
      <View style={{ marginTop: spacing.xxl }}>
        <Button
          title="Disconnect from server"
          onPress={handleLogout}
          variant="danger"
          size="lg"
          loading={loggingOut}
          disabled={loggingOut}
        />
      </View>
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
