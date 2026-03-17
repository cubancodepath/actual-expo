import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Icon } from "@/presentation/components/atoms/Icon";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { useTagsStore } from "@/stores/tagsStore";
import { usePickerStore } from "@/stores/pickerStore";
import { Text } from "@/presentation/components/atoms/Text";
import { IconButton } from "@/presentation/components/atoms/IconButton";
import { TagPill } from "@/presentation/components/atoms/TagPill";
import { SearchBar } from "@/presentation/components/molecules/SearchBar";
import { getTransactionById, updateTransaction } from "@/transactions";
import { extractTagsFromNotes } from "@/tags";
import type { Theme } from "@/theme";

const TAG_COLORS = [
  "#8719e0",
  "#2186eb",
  "#27ab83",
  "#f59b42",
  "#e12d39",
  "#b57bee",
  "#0b69d4",
  "#3ebd93",
  "#de7818",
  "#9446ed",
];

function pickDefaultColor(existingCount: number): string {
  return TAG_COLORS[existingCount % TAG_COLORS.length];
}

export default function TransactionTagsScreen() {
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const { transactionId, mode, currentNotes } = useLocalSearchParams<{
    transactionId?: string;
    mode?: "direct" | "picker";
    currentNotes?: string;
  }>();

  const isPickerMode = mode === "picker";
  const { tags, create: createTag, load: loadTags } = useTagsStore();
  const setPickerTags = usePickerStore((s) => s.setTags);

  const [notes, setNotes] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");
  const [loaded, setLoaded] = useState(false);

  // Load initial state
  useEffect(() => {
    if (isPickerMode) {
      const n = currentNotes ?? "";
      setNotes(n);
      setActiveTags(new Set(extractTagsFromNotes(n)));
      setLoaded(true);
    } else if (transactionId) {
      getTransactionById(transactionId).then((txn) => {
        if (txn) {
          setNotes(txn.notes ?? "");
          setActiveTags(new Set(extractTagsFromNotes(txn.notes)));
        }
        setLoaded(true);
      });
    }
  }, [transactionId, isPickerMode, currentNotes]);

  const query = searchText.toLowerCase().trim();
  const filteredTags = query ? tags.filter((t) => t.tag.toLowerCase().includes(query)) : tags;

  const exactMatch = tags.some((t) => t.tag.toLowerCase() === query);
  const showCreate = query.length > 0 && !exactMatch;

  const saveNotes = useCallback(
    async (newNotes: string) => {
      if (!transactionId) return;
      await updateTransaction(transactionId, { notes: newNotes || null });
    },
    [transactionId],
  );

  function applyChange(newNotes: string, newActiveTags: Set<string>) {
    setNotes(newNotes);
    setActiveTags(newActiveTags);

    if (isPickerMode) {
      setPickerTags(Array.from(newActiveTags));
    } else {
      saveNotes(newNotes);
    }
  }

  function toggleTag(tagName: string) {
    const next = new Set(activeTags);
    let newNotes: string;
    if (next.has(tagName)) {
      next.delete(tagName);
      newNotes = notes
        .replace(new RegExp(`\\s?#${tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g"), "")
        .trim();
    } else {
      next.add(tagName);
      newNotes = notes ? `${notes} #${tagName}` : `#${tagName}`;
    }
    applyChange(newNotes, next);
  }

  async function handleCreate() {
    const tagName = searchText.trim().replace(/^#/, "").replace(/\s/g, "");
    if (!tagName) return;

    const color = pickDefaultColor(tags.length);
    await createTag({ tag: tagName, color });
    await loadTags();
    setSearchText("");

    const next = new Set(activeTags);
    next.add(tagName);
    const newNotes = notes ? `${notes} #${tagName}` : `#${tagName}`;
    applyChange(newNotes, next);
  }

  if (!loaded) return null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: "Tags",
          headerLeft: () => (
            <IconButton
              name="close"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
          headerRight: () => null,
        }}
      />

      <SearchBar
        value={searchText}
        onChangeText={setSearchText}
        placeholder="Search or create tag..."
      />

      {showCreate && (
        <View style={styles.createCard}>
          <Pressable
            onPress={handleCreate}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Icon name="addCircle" size={22} color={colors.primary} />
            <Text
              variant="body"
              color={colors.primary}
              style={{ fontWeight: "600", marginLeft: spacing.sm }}
            >
              Create &quot;{searchText.trim()}&quot;
            </Text>
          </Pressable>
        </View>
      )}

      {filteredTags.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text variant="captionSm" color={colors.textMuted} style={styles.sectionText}>
              {query ? "RESULTS" : "ALL TAGS"}
            </Text>
          </View>
          <View style={styles.groupCard}>
            {filteredTags.map((tag, i) => {
              const isActive = activeTags.has(tag.tag);
              const isLast = i === filteredTags.length - 1;
              return (
                <Pressable
                  key={tag.id}
                  onPress={() => toggleTag(tag.tag)}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                >
                  <TagPill tagName={tag.tag} color={tag.color} />
                  <View style={{ flex: 1 }} />
                  {isActive && <Icon name="checkmark" size={20} color={colors.primary} />}
                  {!isLast && (
                    <View style={[styles.divider, { backgroundColor: colors.divider }]} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {filteredTags.length === 0 && !showCreate && (
        <View style={styles.empty}>
          <Text variant="body" color={colors.textMuted}>
            No tags yet — type above to create one
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  list: {
    paddingTop: theme.spacing.sm,
    paddingBottom: 40,
  },
  sectionHeader: {
    paddingHorizontal: theme.spacing.lg + theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sectionText: {
    fontWeight: "700" as const,
    letterSpacing: 0.8,
  },
  createCard: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    overflow: "hidden" as const,
  },
  groupCard: {
    marginHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    overflow: "hidden" as const,
  },
  item: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.7,
  },
  divider: {
    position: "absolute" as const,
    bottom: 0,
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    height: theme.borderWidth.thin,
  },
  empty: {
    alignItems: "center" as const,
    paddingTop: theme.spacing.xl,
  },
});
