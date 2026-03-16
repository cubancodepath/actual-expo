import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../src/presentation/providers/ThemeProvider";
import { Text, Card, Divider } from "../../../src/presentation/components";
import { GlassButton } from "../../../src/presentation/components/atoms/GlassButton";
import { usePickerStore } from "../../../src/stores/pickerStore";
import { getRecurringDescription } from "../../../src/schedules";
import { todayStr } from "../../../src/lib/date";
import type { RecurConfig } from "../../../src/schedules/types";

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

type Preset = {
  label: string;
  config: RecurConfig;
};

function buildPresets(start: string, t: any): Preset[] {
  return [
    { label: t("everyDay"), config: { frequency: "daily", start } },
    { label: t("everyWeek"), config: { frequency: "weekly", start } },
    { label: t("every2Weeks"), config: { frequency: "weekly", interval: 2, start } },
    { label: t("everyMonth"), config: { frequency: "monthly", start } },
    { label: t("every3Months"), config: { frequency: "monthly", interval: 3, start } },
    { label: t("every6Months"), config: { frequency: "monthly", interval: 6, start } },
    { label: t("everyYear"), config: { frequency: "yearly", start } },
  ];
}

/** Check if a config matches a preset (ignoring start date). */
function matchesPreset(config: RecurConfig, preset: RecurConfig): boolean {
  return (
    config.frequency === preset.frequency &&
    (config.interval ?? 1) === (preset.interval ?? 1) &&
    !config.patterns?.length &&
    !config.endMode &&
    !config.skipWeekend
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RecurrencePickerScreen() {
  const { config: configParam } = useLocalSearchParams<{ config?: string }>();
  const router = useRouter();
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const { t } = useTranslation(["schedules", "common"]);

  const currentConfig: RecurConfig | null = configParam ? JSON.parse(configParam) : null;

  const start = currentConfig?.start ?? todayStr();
  const presets = useMemo(() => buildPresets(start, t), [start, t]);

  // "Never" = no recurrence (null config)
  const isNever = currentConfig == null;

  // Check if current config is a custom one (doesn't match any preset)
  const isCustom =
    currentConfig != null && !presets.some((p) => matchesPreset(currentConfig, p.config));

  function select(config: RecurConfig | null) {
    usePickerStore.getState().setRecurConfig(config);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Custom header ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing.sm,
        }}
      >
        <GlassButton icon="chevron.left" onPress={() => router.back()} />
        <Text variant="headingSm" color={colors.headerText}>
          {t("repeat")}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        {/* ── Preset options ── */}
        <View
          style={{
            marginHorizontal: spacing.lg,
            marginTop: spacing.lg,
            backgroundColor: colors.cardBackground,
            borderRadius: br.lg,
            borderWidth: bw.thin,
            borderColor: colors.cardBorder,
            overflow: "hidden",
          }}
        >
          {/* Never (no recurrence) */}
          <Pressable
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                minHeight: 44,
              },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => select(null)}
          >
            <Text variant="body" color={colors.textPrimary} style={{ flex: 1 }}>
              {t("never")}
            </Text>
            <View style={{ width: 20, alignItems: "center" }}>
              {isNever && <Ionicons name="checkmark" size={20} color={colors.primary} />}
            </View>
          </Pressable>

          {presets.map((preset, i) => {
            const selected = currentConfig != null && matchesPreset(currentConfig, preset.config);

            return (
              <View key={preset.label}>
                <Divider style={{ marginLeft: spacing.lg }} />
                <Pressable
                  style={({ pressed }) => [
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: spacing.lg,
                      paddingVertical: spacing.md,
                      minHeight: 44,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => select(preset.config)}
                >
                  <Text variant="body" color={colors.textPrimary} style={{ flex: 1 }}>
                    {preset.label}
                  </Text>
                  <View style={{ width: 20, alignItems: "center" }}>
                    {selected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* ── Custom option ── */}
        <View
          style={{
            marginHorizontal: spacing.lg,
            marginTop: spacing.md,
            backgroundColor: colors.cardBackground,
            borderRadius: br.lg,
            borderWidth: bw.thin,
            borderColor: colors.cardBorder,
            overflow: "hidden",
          }}
        >
          <Pressable
            style={({ pressed }) => [
              {
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                minHeight: 44,
              },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              router.push({
                pathname: "./recurrence-custom",
                params: currentConfig
                  ? { config: JSON.stringify(currentConfig) }
                  : { config: JSON.stringify({ frequency: "monthly", start }) },
              });
            }}
          >
            <Text variant="body" color={colors.textPrimary} style={{ flex: 1 }}>
              {t("custom")}
            </Text>
            {isCustom && (
              <Text
                variant="bodySm"
                color={colors.textSecondary}
                style={{ marginRight: spacing.sm }}
                numberOfLines={1}
              >
                {getRecurringDescription(currentConfig!)}
              </Text>
            )}
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
