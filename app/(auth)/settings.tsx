import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
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
import { resetAllStores } from "../../src/stores/resetStores";
import type { Theme } from "../../src/theme";

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

  const { serverUrl, fileId, groupId, encryptKeyId, lastSyncedTimestamp, clearAll } =
    usePrefsStore();
  const { status, error, lastSync, sync } = useSyncStore();
  const [loggingOut, setLoggingOut] = useState(false);

  const lastSyncText = lastSync
    ? lastSync.toLocaleTimeString()
    : lastSyncedTimestamp
      ? lastSyncedTimestamp.slice(0, 16)
      : "Never";

  const syncButtonTitle =
    status === "success" ? "Sync again" : status === "error" ? "Retry sync" : "Sync now";

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

      {/* Budget */}
      <SectionHeader title="Budget" style={{ marginTop: spacing.xl }} />
      <Card>
        <ListItem
          title="Change Budget"
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
