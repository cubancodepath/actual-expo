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
  const { colors, spacing, borderWidth: bw } = useTheme();
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
              color={colors.textMuted}
              style={styles.sectionText}
            >
              {group.label.toUpperCase()}
            </Text>
          </View>
          <View style={styles.groupCard}>
            {group.accounts.map((a, i) => {
              const isSelected = a.id === selectedId;
              const isLast = i === group.accounts.length - 1;
              return (
                <Pressable
                  key={a.id}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => select(a.id, a.name)}
                >
                  <View style={styles.checkSlot}>
                    {isSelected && (
                      <Ionicons name="checkmark" size={20} color={colors.primary} />
                    )}
                  </View>
                  <Text
                    variant="body"
                    color={colors.textPrimary}
                    style={styles.itemLabel}
                  >
                    {a.name}
                  </Text>
                  <Amount value={a.balance ?? 0} variant="bodySm" />
                  {!isLast && (
                    <View style={{ position: 'absolute', bottom: 0, left: spacing.lg, right: spacing.lg, height: bw.thin, backgroundColor: colors.divider }} />
                  )}
                </Pressable>
              );
            })}
          </View>
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
    paddingHorizontal: theme.spacing.lg + theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sectionText: {
    fontWeight: '700' as const,
    letterSpacing: 0.8,
  },
  groupCard: {
    marginHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    overflow: 'hidden' as const,
  },
  item: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    minHeight: 44,
  },
  pressed: {
    opacity: 0.7,
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
