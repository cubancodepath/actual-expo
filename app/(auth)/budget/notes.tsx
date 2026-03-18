import { useEffect, useState } from "react";
import { SectionList, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Icon } from "@/presentation/components/atoms/Icon";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { RowSeparator } from "@/presentation/components/atoms/RowSeparator";
import { Button } from "@/presentation/components/atoms/Button";
import { useBudgetStore } from "@/stores/budgetStore";
import { first } from "@/db";

// ---------------------------------------------------------------------------
// Parse "on <date>" from the end of a note line
// ---------------------------------------------------------------------------

function parseLine(line: string): { text: string; date: string } {
  const raw = line.startsWith("- ") ? line.slice(2) : line;
  const match = raw.match(/^(.+?)\s+on\s+(.+)$/);
  if (match) return { text: match[1], date: match[2] };
  return { text: raw, date: "" };
}

// ---------------------------------------------------------------------------
// Build sections grouped by date
// ---------------------------------------------------------------------------

type NoteSection = { title: string; data: string[] };

function buildSections(lines: string[]): NoteSection[] {
  const map = new Map<string, string[]>();

  for (const line of lines) {
    const { text, date } = parseLine(line);
    const title = date || "__other__";
    if (!map.has(title)) map.set(title, []);
    map.get(title)!.push(text);
  }

  const sections = Array.from(map, ([title, data]) => ({ title, data }));

  // Sort date sections newest-first; push '__other__' to the end
  sections.sort((a, b) => {
    if (a.title === "__other__") return 1;
    if (b.title === "__other__") return -1;
    return new Date(b.title).getTime() - new Date(a.title).getTime();
  });

  return sections;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BudgetNotesScreen() {
  const { t } = useTranslation("budget");
  const { colors, spacing, borderRadius: br } = useTheme();
  const router = useRouter();
  const { categoryName } = useLocalSearchParams<{ categoryName?: string }>();
  const month = useBudgetStore((s) => s.month);

  const [sections, setSections] = useState<NoteSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const noteId = `budget-${month}`;
      const row = await first<{ note: string }>("SELECT note FROM notes WHERE id = ?", [noteId]);
      if (row?.note) {
        const allLines = row.note
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        const filtered = categoryName
          ? allLines.filter((l) => l.toLowerCase().includes(categoryName.toLowerCase()))
          : allLines;

        setSections(buildSections(filtered));
      }
      setLoading(false);
    })();
  }, [month, categoryName]);

  if (loading) return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Button
              icon="close"
              buttonStyle="borderless"
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(item, i) => `${i}-${item}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        style={{ flex: 1, backgroundColor: colors.pageBackground }}
        renderSectionHeader={({ section }) => (
          <View style={{ paddingTop: spacing.md, paddingBottom: spacing.xs }}>
            <Text
              variant="captionSm"
              color={colors.textMuted}
              style={{ textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700" }}
            >
              {section.title === "__other__" ? t("other") : section.title}
            </Text>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const isFirst = index === 0;
          const isLast = index === section.data.length - 1;
          return (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                backgroundColor: colors.cardBackground,
                borderTopLeftRadius: isFirst ? br.lg : 0,
                borderTopRightRadius: isFirst ? br.lg : 0,
                borderBottomLeftRadius: isLast ? br.lg : 0,
                borderBottomRightRadius: isLast ? br.lg : 0,
                padding: spacing.md,
                paddingHorizontal: spacing.lg,
                gap: spacing.sm,
              }}
            >
              <Icon
                name="swapHorizontal"
                size={16}
                color={colors.primary}
                style={{ marginTop: 2 }}
              />
              <Text variant="body" color={colors.textPrimary} style={{ flex: 1 }}>
                {item}
              </Text>
              {!isLast && <RowSeparator />}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 60, gap: spacing.md }}>
            <Icon name="documentTextOutline" size={40} color={colors.textMuted} />
            <Text variant="body" color={colors.textSecondary} style={{ textAlign: "center" }}>
              {categoryName
                ? t("noMovementsForCategory", { name: categoryName })
                : t("noMovementsThisMonth")}
            </Text>
          </View>
        }
      />
    </>
  );
}
