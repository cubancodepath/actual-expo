import { useState, useEffect, useMemo } from "react";
import { View, FlatList, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { ListItem, SearchBar, EmptyState, ErrorBanner } from "@/presentation/components";
import { useErrorHandler } from "@/presentation/hooks/useErrorHandler";
import { getGoCardlessBanks } from "@/bank-sync/service";
import { useTranslation } from "react-i18next";
import type { GoCardlessBank } from "@/bank-sync/types";
import type { Theme } from "@/theme";

export default function InstitutionScreen() {
  const { country } = useLocalSearchParams<{ country: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation("bankSync");
  const { error, handleError, dismissError } = useErrorHandler();

  const [banks, setBanks] = useState<GoCardlessBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadBanks();
  }, [country]);

  async function loadBanks() {
    setLoading(true);
    await handleError(async () => {
      const result = await getGoCardlessBanks(country, true);
      setBanks(result);
    });
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return banks;
    const q = search.toLowerCase();
    return banks.filter((b) => b.name.toLowerCase().includes(q));
  }, [search, banks]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder={t("institution.searchPlaceholder")}
      />
      <ErrorBanner error={error} onDismiss={dismissError} onRetry={loadBanks} />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ListItem
            title={item.name}
            showChevron
            showSeparator={index < filtered.length - 1}
            onPress={() =>
              router.push({
                pathname: "/(auth)/bank-sync/consent",
                params: { institutionId: item.id, institutionName: item.name },
              })
            }
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="business-outline"
            title={t("institution.noResults")}
            description={t("institution.noResultsDescription")}
          />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  center: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  list: {
    paddingBottom: 80,
  },
});
