import { useEffect, useState } from 'react';
import { SectionList, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import { useBudgetStore } from '../../../src/stores/budgetStore';
import { first } from '../../../src/db';

// ---------------------------------------------------------------------------
// Parse "on <date>" from the end of a note line
// ---------------------------------------------------------------------------

function parseLine(line: string): { text: string; date: string } {
  const raw = line.startsWith('- ') ? line.slice(2) : line;
  const match = raw.match(/^(.+?)\s+on\s+(.+)$/);
  if (match) return { text: match[1], date: match[2] };
  return { text: raw, date: '' };
}

// ---------------------------------------------------------------------------
// Build sections grouped by date
// ---------------------------------------------------------------------------

type NoteSection = { title: string; data: string[] };

function buildSections(lines: string[]): NoteSection[] {
  const sections: NoteSection[] = [];
  let current: NoteSection | null = null;

  for (const line of lines) {
    const { text, date } = parseLine(line);
    const title = date || 'Other';
    if (!current || current.title !== title) {
      current = { title, data: [] };
      sections.push(current);
    }
    current.data.push(text);
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function BudgetNotesScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { categoryName } = useLocalSearchParams<{ categoryName?: string }>();
  const month = useBudgetStore((s) => s.month);

  const [sections, setSections] = useState<NoteSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const noteId = `budget-${month}`;
      const row = await first<{ note: string }>('SELECT note FROM notes WHERE id = ?', [noteId]);
      if (row?.note) {
        const allLines = row.note
          .split('\n')
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
          <IconButton
            sfSymbol="xmark"
            size={22}
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
            style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' }}
          >
            {section.title}
          </Text>
        </View>
      )}
      renderItem={({ item }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            backgroundColor: colors.cardBackground,
            borderRadius: br.lg,
            borderWidth: bw.thin,
            borderColor: colors.cardBorder,
            padding: spacing.md,
            paddingHorizontal: spacing.lg,
            marginBottom: spacing.xs,
            gap: spacing.sm,
          }}
        >
          <Ionicons
            name="swap-horizontal"
            size={16}
            color={colors.primary}
            style={{ marginTop: 2 }}
          />
          <Text variant="body" color={colors.textPrimary} style={{ flex: 1 }}>
            {item}
          </Text>
        </View>
      )}
      ListEmptyComponent={
        <View style={{ alignItems: 'center', paddingTop: 60, gap: spacing.md }}>
          <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            {categoryName
              ? `No movements for ${categoryName} this month`
              : 'No budget movements this month'}
          </Text>
        </View>
      }
    />
    </>
  );
}
