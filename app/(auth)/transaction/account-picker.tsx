import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAccounts, useAccountBalance } from "@/presentation/hooks/useAccounts";
import { Icon } from "@/presentation/components/atoms/Icon";
import { usePickerStore } from "@/stores/pickerStore";
import { groupAccounts } from "@/accounts";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { Amount } from "@/presentation/components/atoms/Amount";
import type { Account } from "@/accounts/types";
import type { Theme } from "@/theme";

function AccountPickerRow({
  account,
  isSelected,
  isLast,
  onSelect,
  styles,
}: {
  account: Account;
  isSelected: boolean;
  isLast: boolean;
  onSelect: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const { colors, spacing, borderWidth: bw } = useTheme();
  const balance = useAccountBalance(account.id);
  return (
    <Pressable
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
      onPress={onSelect}
    >
      <View style={styles.checkSlot}>
        {isSelected && <Icon name="checkmark" size={20} color={colors.primary} />}
      </View>
      <Text variant="body" color={colors.textPrimary} style={styles.itemLabel}>
        {account.name}
      </Text>
      <Amount value={balance} variant="bodySm" />
      {!isLast && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: spacing.lg,
            right: spacing.lg,
            height: bw.thin,
            backgroundColor: colors.divider,
          }}
        />
      )}
    </Pressable>
  );
}

export default function AccountPickerScreen() {
  const { selectedId } = useLocalSearchParams<{ selectedId?: string }>();
  const router = useRouter();
  const { colors, spacing, borderWidth: bw } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { accounts } = useAccounts();
  const setAccount = usePickerStore((s) => s.setAccount);

  const groups = groupAccounts(accounts);

  function select(id: string, name: string) {
    setAccount({ id, name });
    router.back();
  }

  return (
    <View style={styles.container}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.lg,
          paddingBottom: spacing.sm,
          backgroundColor: colors.pageBackground,
        }}
      >
        <GlassButton icon="chevronBack" onPress={() => router.back()} />
        <Text variant="headingSm" color={colors.headerText}>
          Account
        </Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {groups.map((group) => (
          <View key={group.type}>
            <View style={styles.sectionHeader}>
              <Text variant="captionSm" color={colors.textMuted} style={styles.sectionText}>
                {group.label.toUpperCase()}
              </Text>
            </View>
            <View style={styles.groupCard}>
              {group.accounts.map((a, i) => (
                <AccountPickerRow
                  key={a.id}
                  account={a}
                  isSelected={a.id === selectedId}
                  isLast={i === group.accounts.length - 1}
                  onSelect={() => select(a.id, a.name)}
                  styles={styles}
                />
              ))}
            </View>
          </View>
        ))}
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
    paddingHorizontal: theme.spacing.lg + theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sectionText: {
    fontWeight: "700" as const,
    letterSpacing: 0.8,
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
  checkSlot: {
    width: 24,
    alignItems: "center" as const,
    marginRight: theme.spacing.sm,
  },
  itemLabel: {
    flex: 1,
  },
});
