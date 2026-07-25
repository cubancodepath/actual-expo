/**
 * RulesPage — view and manage auto-categorization rules.
 *
 * Mirrors desktop-client/src/components/mobile/rules/MobileRulesPage.tsx.
 */

import { useState, useMemo } from "react";
import { View, Pressable, Alert } from "react-native";
import { SectionList } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { Text } from "@/design-system/atoms/Text";
import { Icon } from "@/design-system/atoms/Icon";
import { SearchBar } from "@/design-system/molecules/SearchBar";
import { EmptyState } from "@/design-system/molecules/EmptyState";
import { useRules } from "@/lib/hooks/useRules";
import { sendMessages } from "@/core/server/sync";
import { Timestamp } from "@/core/crdt";
import type { Rule } from "@/core/server/rules/rule";

const STAGE_LABELS: Record<string, string> = {
  pre: "Pre",
  post: "Post",
  null: "Default",
};

function RuleRow({ rule, onDelete }: { rule: Rule; onDelete: (id: string) => void }) {
  const { colors, spacing, borderRadius: br } = useTheme();

  const stage = (rule.stage as string | null) ?? null;
  const stageLabel = STAGE_LABELS[stage ?? "null"] ?? "Default";
  const stageColor =
    stage === "pre" ? colors.primary : stage === "post" ? colors.warning : colors.textMuted;

  // Build a readable summary from the first condition and action
  const firstCondition = rule.conditions?.[0];
  const firstAction = rule.actions?.[0];
  const actionAny = firstAction as unknown as Record<string, unknown> | undefined;
  const summary = [
    firstCondition ? `If ${String(firstCondition.field)} ${String(firstCondition.op)} …` : null,
    actionAny ? `→ ${String(actionAny.field ?? actionAny.op)} = …` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Pressable
      onPress={() =>
        Alert.alert("Rule", summary || "No conditions set", [
          {
            text: "Delete",
            style: "destructive",
            onPress: () => rule.id && onDelete(rule.id),
          },
          { text: "Cancel", style: "cancel" },
        ])
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.cardBackground,
        gap: spacing.sm,
      }}
    >
      {/* Stage badge */}
      <View
        style={{
          backgroundColor: `${stageColor}22`,
          borderRadius: br.sm,
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
        }}
      >
        <Text variant="captionSm" color={stageColor} style={{ fontWeight: "700" }}>
          {stageLabel}
        </Text>
      </View>

      {/* Rule summary */}
      <Text variant="body" style={{ flex: 1 }} numberOfLines={2} color={colors.textPrimary}>
        {summary || "Unknown rule"}
      </Text>

      <Icon name="chevronForward" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

export default function RulesPage() {
  const { t } = useTranslation("settings");
  const { colors, spacing, borderWidth: bw } = useTheme();
  const { rules, isLoading } = useRules();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return rules;
    const q = filter.toLowerCase();
    return rules.filter((r) => {
      const text = JSON.stringify(r.conditions) + JSON.stringify(r.actions);
      return text.toLowerCase().includes(q);
    });
  }, [rules, filter]);

  // Group by stage
  const sections = useMemo(() => {
    const stages: Record<string, Rule[]> = { pre: [], "": [], post: [] };
    for (const rule of filtered) {
      const s = rule.stage ?? "";
      if (!stages[s]) stages[s] = [];
      stages[s].push(rule);
    }
    return [
      { title: "Pre", key: "pre", data: stages.pre },
      { title: "Default", key: "", data: stages[""] },
      { title: "Post", key: "post", data: stages.post },
    ].filter((s) => s.data.length > 0);
  }, [filtered]);

  async function handleDelete(ruleId: string) {
    await sendMessages([
      {
        timestamp: Timestamp.send()!,
        dataset: "rules",
        row: ruleId,
        column: "tombstone",
        value: 1,
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Stack.Screen options={{ title: "Rules" }} />

      <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <SearchBar value={filter} onChangeText={setFilter} placeholder="Search rules…" />
      </View>

      {!isLoading && filtered.length === 0 ? (
        <EmptyState
          icon="receiptOutline"
          title={filter ? "No rules found" : "No rules"}
          description={
            filter
              ? "Try adjusting your search."
              : "Rules are applied automatically when transactions are imported."
          }
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(r) => r.id ?? ""}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.xs,
                backgroundColor: colors.headerBackground,
              }}
            >
              <Text
                variant="captionSm"
                color={colors.textMuted}
                style={{ textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700" }}
              >
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => <RuleRow rule={item} onDelete={handleDelete} />}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: bw.thin,
                backgroundColor: colors.divider,
                marginLeft: spacing.lg,
              }}
            />
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}
