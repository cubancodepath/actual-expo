import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { usePayeesStore } from "@/stores/payeesStore";
import { usePickerStore } from "@/stores/pickerStore";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { GlassButton } from "@/presentation/components/atoms/GlassButton";
import { SearchBar } from "@/presentation/components/molecules/SearchBar";
import type { Theme } from "@/theme";

export default function PayeePickerScreen() {
  const { selectedId, selectedName, accountId } = useLocalSearchParams<{
    selectedId?: string;
    selectedName?: string;
    accountId?: string;
  }>();
  const router = useRouter();
  const { colors, spacing, borderWidth: bw } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { payees, load } = usePayeesStore();
  const setPayee = usePickerStore((s) => s.setPayee);
  const [search, setSearch] = useState(selectedName ?? "");

  useEffect(() => {
    if (payees.length === 0) load();
  }, []);

  const transfers = payees.filter((p) => p.transfer_acct != null && p.transfer_acct !== accountId);
  const regular = payees
    .filter((p) => p.transfer_acct == null)
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const query = search.toLowerCase();
  const filteredTransfers = query
    ? transfers.filter((p) => p.name.toLowerCase().includes(query))
    : transfers;
  const filteredRegular = query
    ? regular.filter((p) => p.name.toLowerCase().includes(query))
    : regular;

  const exactMatch = payees.some((p) => p.name.toLowerCase() === search.trim().toLowerCase());

  function select(id: string | null, name: string, transferAcct?: string | null) {
    setPayee({ id, name, transferAcct });
    router.back();
  }

  const showCreateRow = search.trim() !== "" && !exactMatch;
  const noneSelected = !selectedId;

  // Build top card items: No payee + Create row
  const topItems: Array<{ key: string; node: React.ReactNode }> = [];
  topItems.push({
    key: "none",
    node: (
      <Pressable
        style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        onPress={() => select(null, "")}
      >
        <Text variant="body" color={colors.textMuted} style={styles.itemText}>
          No payee
        </Text>
        {noneSelected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
      </Pressable>
    ),
  });
  if (showCreateRow) {
    topItems.push({
      key: "create",
      node: (
        <Pressable
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          onPress={() => select(null, search.trim())}
        >
          <Text variant="body" color={colors.link} style={styles.itemText}>
            Create "{search.trim()}"
          </Text>
        </Pressable>
      ),
    });
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
        <GlassButton icon="chevron.left" onPress={() => router.back()} />
        <Text variant="headingSm" color={colors.headerText}>
          Payee
        </Text>
        <View style={{ width: 48 }} />
      </View>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search payees or accounts..."
        autoFocus
      />

      <ScrollView contentContainerStyle={styles.list}>
        {/* Top card: No payee + Create */}
        <View style={styles.topCard}>
          {topItems.map((item, i) => (
            <View key={item.key} style={{ position: "relative" }}>
              {i > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: spacing.lg,
                    right: spacing.lg,
                    height: bw.thin,
                    backgroundColor: colors.divider,
                  }}
                />
              )}
              {item.node}
            </View>
          ))}
        </View>

        {/* Transfer to Account */}
        {filteredTransfers.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text variant="captionSm" color={colors.textMuted} style={styles.sectionText}>
                TRANSFER TO ACCOUNT
              </Text>
            </View>
            <View style={styles.groupCard}>
              {filteredTransfers.map((p, i) => {
                const isSelected = p.id === selectedId;
                const isLast = i === filteredTransfers.length - 1;
                return (
                  <Pressable
                    key={p.id}
                    style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                    onPress={() => select(p.id, p.name, p.transfer_acct)}
                  >
                    <Ionicons
                      name="swap-horizontal"
                      size={16}
                      color={colors.link}
                      style={styles.transferIcon}
                    />
                    <Text variant="body" color={colors.textPrimary} style={styles.itemText}>
                      {p.name}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
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
              })}
            </View>
          </>
        )}

        {/* Regular payees */}
        {filteredRegular.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text variant="captionSm" color={colors.textMuted} style={styles.sectionText}>
                PAYEES
              </Text>
            </View>
            <View style={styles.groupCard}>
              {filteredRegular.map((p, i) => {
                const isSelected = p.id === selectedId;
                const isLast = i === filteredRegular.length - 1;
                return (
                  <Pressable
                    key={p.id}
                    style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                    onPress={() => select(p.id, p.name)}
                  >
                    {p.favorite && (
                      <Ionicons
                        name="star"
                        size={14}
                        color={colors.warning}
                        style={styles.starIcon}
                      />
                    )}
                    <Text variant="body" color={colors.textPrimary} style={styles.itemText}>
                      {p.name}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color={colors.primary} />}
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
              })}
            </View>
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
    paddingHorizontal: theme.spacing.lg + theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sectionText: {
    fontWeight: "700" as const,
    letterSpacing: 0.8,
  },
  topCard: {
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.sm,
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
  divider: {
    height: theme.borderWidth.thin,
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
  itemText: {
    flex: 1,
  },
  transferIcon: {
    marginRight: theme.spacing.sm,
  },
  starIcon: {
    marginRight: theme.spacing.sm,
  },
});
