import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePayeesStore } from '../../../src/stores/payeesStore';
import { usePickerStore } from '../../../src/stores/pickerStore';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { SearchBar } from '../../../src/presentation/components/molecules/SearchBar';
import type { Theme } from '../../../src/theme';

export default function PayeePickerScreen() {
  const { selectedId } = useLocalSearchParams<{ selectedId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { payees, load } = usePayeesStore();
  const setPayee = usePickerStore((s) => s.setPayee);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (payees.length === 0) load();
  }, []);

  const transfers = payees.filter((p) => p.transfer_acct != null);
  const regular = [...payees.filter((p) => p.transfer_acct == null)].sort(
    (a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    },
  );

  const query = search.toLowerCase();
  const filteredTransfers = query
    ? transfers.filter((p) => p.name.toLowerCase().includes(query))
    : transfers;
  const filteredRegular = query
    ? regular.filter((p) => p.name.toLowerCase().includes(query))
    : regular;

  const exactMatch = payees.some(
    (p) => p.name.toLowerCase() === search.trim().toLowerCase(),
  );

  function select(id: string | null, name: string) {
    setPayee({ id, name });
    router.back();
  }

  const showCreateRow = search.trim() !== '' && !exactMatch;
  const noneSelected = !selectedId;

  return (
    <View style={styles.container}>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search payees or accounts..."
      />

      <ScrollView contentContainerStyle={styles.list}>
        {/* No payee */}
        <Pressable style={styles.item} onPress={() => select(null, '')}>
          <Text variant="body" color={theme.colors.textMuted} style={styles.itemText}>
            No payee
          </Text>
          {noneSelected && (
            <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
          )}
        </Pressable>

        {/* Create new */}
        {showCreateRow && (
          <Pressable
            style={styles.item}
            onPress={() => select(null, search.trim())}
          >
            <Text variant="body" color={theme.colors.link} style={styles.itemText}>
              Create "{search.trim()}"
            </Text>
          </Pressable>
        )}

        {/* Transfer to Account */}
        {filteredTransfers.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text
                variant="captionSm"
                color={theme.colors.textMuted}
                style={styles.sectionText}
              >
                TRANSFER TO ACCOUNT
              </Text>
            </View>
            {filteredTransfers.map((p) => {
              const isSelected = p.id === selectedId;
              return (
                <Pressable
                  key={p.id}
                  style={styles.item}
                  onPress={() => select(p.id, p.name)}
                >
                  <Text
                    variant="body"
                    color={theme.colors.link}
                    style={styles.transferIcon}
                  >
                    ⇄
                  </Text>
                  <Text variant="body" color={theme.colors.textPrimary} style={styles.itemText}>
                    {p.name}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </>
        )}

        {/* Regular payees */}
        {filteredRegular.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text
                variant="captionSm"
                color={theme.colors.textMuted}
                style={styles.sectionText}
              >
                PAYEES
              </Text>
            </View>
            {filteredRegular.map((p) => {
              const isSelected = p.id === selectedId;
              return (
                <Pressable
                  key={p.id}
                  style={styles.item}
                  onPress={() => select(p.id, p.name)}
                >
                  {p.favorite && (
                    <Text
                      variant="body"
                      color={theme.colors.warning}
                      style={styles.star}
                    >
                      ★
                    </Text>
                  )}
                  <Text variant="body" color={theme.colors.textPrimary} style={styles.itemText}>
                    {p.name}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                  )}
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  list: {
    paddingBottom: 40,
  },
  sectionHeader: {
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.borderWidth.default,
    borderBottomColor: theme.colors.divider,
  },
  sectionText: {
    fontWeight: '700' as const,
    letterSpacing: 1,
  },
  item: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.borderWidth.default,
    borderBottomColor: theme.colors.divider,
    backgroundColor: theme.colors.cardBackground,
  },
  itemText: {
    flex: 1,
  },
  transferIcon: {
    marginRight: theme.spacing.sm,
  },
  star: {
    marginRight: theme.spacing.xs,
  },
});
