/**
 * PayeesPage — manage payees (list, search, merge, delete).
 *
 * Mirrors desktop-client/src/components/mobile/payees/MobilePayeesPage.tsx.
 */

import { useState, useMemo, useCallback } from "react";
import { View, Pressable, Alert } from "react-native";
import { FlatList } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design-system/providers/ThemeProvider";
import { Text } from "@/design-system/atoms/Text";
import { Icon } from "@/design-system/atoms/Icon";
import { SearchBar } from "@/design-system/molecules/SearchBar";
import { EmptyState } from "@/design-system/molecules/EmptyState";
import { usePayees } from "@/features/transactions/hooks/usePayees";
import { deletePayee, updatePayee } from "@/core/domain/payees";
import type { Payee } from "@/core/domain/payees/types";

function PayeeRow({ payee, onPress }: { payee: Payee; onPress: (p: Payee) => void }) {
  const { colors, spacing, borderWidth: bw } = useTheme();
  return (
    <Pressable
      onPress={() => onPress(payee)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.cardBackground,
      }}
    >
      <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
        {payee.name}
      </Text>
      {payee.favorite && (
        <Icon name="star" size={14} color={colors.primary} style={{ marginRight: spacing.xs }} />
      )}
      <Icon name="chevronForward" size={14} color={colors.textMuted} />
    </Pressable>
  );
}

export default function PayeesPage() {
  const { t } = useTranslation("settings");
  const { colors, spacing } = useTheme();
  const { payees, isLoading } = usePayees();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return payees.filter((p) => !p.tombstone);
    const q = filter.toLowerCase();
    return payees.filter((p) => !p.tombstone && p.name.toLowerCase().includes(q));
  }, [payees, filter]);

  const handlePayeePress = useCallback(
    (payee: Payee) => {
      Alert.alert(payee.name, undefined, [
        {
          text: "Rename",
          onPress: () => {
            Alert.prompt(
              "Rename",
              "Enter new name",
              async (name) => {
                if (name?.trim()) {
                  await updatePayee(payee.id, { name: name.trim() });
                }
              },
              "plain-text",
              payee.name,
            );
          },
        },
        {
          text: payee.favorite ? "Remove from Favorites" : "Mark as Favorite",
          onPress: () => updatePayee(payee.id, { favorite: !payee.favorite }),
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            Alert.alert(t("deletePayee"), t("deletePayeeConfirm", { name: payee.name }), [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => deletePayee(payee.id),
              },
            ]),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [t],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Stack.Screen options={{ title: "Payees" }} />

      <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
        <SearchBar value={filter} onChangeText={setFilter} placeholder="Search payees…" />
      </View>

      {!isLoading && filtered.length === 0 ? (
        <EmptyState
          icon="peopleOutline"
          title={filter ? t("noPayeesFound") : t("noPayees")}
          description={filter ? "Try adjusting your search." : t("payeesCreatedAuto")}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <PayeeRow payee={item} onPress={handlePayeePress} />}
          ItemSeparatorComponent={() => (
            <View
              style={{ height: 0.5, backgroundColor: colors.divider, marginLeft: spacing.lg }}
            />
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}
    </View>
  );
}
