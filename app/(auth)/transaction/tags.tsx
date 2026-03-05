import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { useTagsStore } from '../../../src/stores/tagsStore';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { TagPill } from '../../../src/presentation/components/atoms/TagPill';
import { IconButton } from '../../../src/presentation/components/atoms/IconButton';
import { getTransactionById, updateTransaction } from '../../../src/transactions';
import { extractTagsFromNotes } from '../../../src/tags';

export default function TransactionTagsScreen() {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const router = useRouter();
  const { transactionId } = useLocalSearchParams<{ transactionId: string }>();
  const { tags, create: createTag } = useTagsStore();

  const [notes, setNotes] = useState('');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');
  const [loaded, setLoaded] = useState(false);

  // Load transaction notes on mount
  useEffect(() => {
    if (!transactionId) return;
    getTransactionById(transactionId).then(txn => {
      if (txn) {
        setNotes(txn.notes ?? '');
        setActiveTags(new Set(extractTagsFromNotes(txn.notes)));
      }
      setLoaded(true);
    });
  }, [transactionId]);

  const query = searchText.toLowerCase().trim();
  const filteredTags = query
    ? tags.filter(t => t.tag.toLowerCase().includes(query))
    : tags;

  const exactMatch = tags.some(t => t.tag.toLowerCase() === query);
  const showCreate = query.length > 0 && !exactMatch;

  const saveNotes = useCallback(async (newNotes: string) => {
    if (!transactionId) return;
    await updateTransaction(transactionId, { notes: newNotes || null });
  }, [transactionId]);

  async function handleToggleTag(tagName: string) {
    let newNotes: string;
    if (activeTags.has(tagName)) {
      // Remove tag from notes
      newNotes = notes.replace(new RegExp(`\\s?#${tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), '').trim();
      setActiveTags(prev => { const next = new Set(prev); next.delete(tagName); return next; });
    } else {
      // Add tag to notes
      newNotes = notes ? `${notes} #${tagName}` : `#${tagName}`;
      setActiveTags(prev => new Set(prev).add(tagName));
    }
    setNotes(newNotes);
    await saveNotes(newNotes);
  }

  async function handleCreateAndAdd() {
    const tagName = searchText.trim().replace(/^#/, '').replace(/\s/g, '');
    if (!tagName) return;
    await createTag({ tag: tagName });
    setSearchText('');
    // Add to notes
    const newNotes = notes ? `${notes} #${tagName}` : `#${tagName}`;
    setNotes(newNotes);
    setActiveTags(prev => new Set(prev).add(tagName));
    await saveNotes(newNotes);
  }

  if (!loaded) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Stack.Screen
        options={{
          title: 'Tags',
          headerLeft: () => (
            <IconButton
              icon="close"
              size={22}
              color={colors.headerText}
              onPress={() => router.back()}
            />
          ),
        }}
      />

      {/* Search input */}
      <View style={{ padding: spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.inputBackground,
            borderRadius: br.full,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderWidth: bw.thin,
            borderColor: colors.inputBorder,
          }}
        >
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search or create tag..."
            placeholderTextColor={colors.textMuted}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              flex: 1,
              fontSize: 15,
              color: colors.textPrimary,
              marginLeft: spacing.sm,
              paddingVertical: 4,
            }}
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Create new tag option */}
      {showCreate && (
        <Pressable
          onPress={handleCreateAndAdd}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            gap: spacing.md,
            opacity: pressed ? 0.6 : 1,
            backgroundColor: colors.cardBackground,
          })}
        >
          <Ionicons name="add-circle" size={22} color={colors.primary} />
          <Text variant="body" color={colors.primary} style={{ fontWeight: '600' }}>
            Create "{searchText.trim()}"
          </Text>
        </Pressable>
      )}

      {/* Tag list */}
      {filteredTags.map(tag => {
        const isActive = activeTags.has(tag.tag);
        return (
          <Pressable
            key={tag.id}
            onPress={() => handleToggleTag(tag.tag)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              backgroundColor: colors.cardBackground,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <TagPill tagName={tag.tag} color={tag.color} />
            {isActive && (
              <Ionicons name="checkmark" size={20} color={colors.primary} />
            )}
          </Pressable>
        );
      })}

      {filteredTags.length === 0 && !showCreate && (
        <View style={{ alignItems: 'center', paddingTop: spacing.xl }}>
          <Text variant="body" color={colors.textMuted}>
            No tags yet
          </Text>
        </View>
      )}
    </View>
  );
}
