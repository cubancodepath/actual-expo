import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAccountsStore } from '../../../src/stores/accountsStore';
import { usePickerStore } from '../../../src/stores/pickerStore';
import { groupAccounts } from '../../../src/accounts';
import { useTheme, useThemedStyles } from '../../../src/presentation/providers/ThemeProvider';
import { Text } from '../../../src/presentation/components/atoms/Text';
import { Amount } from '../../../src/presentation/components/atoms/Amount';
import type { Theme } from '../../../src/theme';

export default function AccountPickerScreen() {
  const { selectedId } = useLocalSearchParams<{ selectedId?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts } = useAccountsStore();
  const setAccount = usePickerStore((s) => s.setAccount);

  const groups = groupAccounts(accounts);

  function select(id: string, name: string) {
    setAccount({ id, name });
    router.back();
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.list}
    >
      {groups.map((group) => (
        <View key={group.type}>
          <View style={styles.sectionHeader}>
            <Text
              variant="captionSm"
              color={theme.colors.textMuted}
              style={styles.sectionText}
            >
              {group.label.toUpperCase()}
            </Text>
          </View>
          {group.accounts.map((a) => {
            const isSelected = a.id === selectedId;
            return (
              <Pressable
                key={a.id}
                style={styles.item}
                onPress={() => select(a.id, a.name)}
              >
                <View style={styles.checkSlot}>
                  {isSelected && (
                    <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                  )}
                </View>
                <Text
                  variant="body"
                  color={theme.colors.textPrimary}
                  style={styles.itemLabel}
                >
                  {a.name}
                </Text>
                <Amount value={a.balance ?? 0} variant="bodySm" />
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
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
    justifyContent: 'space-between' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.borderWidth.default,
    borderBottomColor: theme.colors.divider,
    backgroundColor: theme.colors.cardBackground,
  },
  checkSlot: {
    width: 24,
    alignItems: 'center' as const,
    marginRight: theme.spacing.sm,
  },
  itemLabel: {
    flex: 1,
  },
});
