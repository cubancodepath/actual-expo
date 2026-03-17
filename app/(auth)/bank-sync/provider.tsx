import { View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text, ListItem } from "@/presentation/components";
import { useBankSyncStore } from "@/stores/bankSyncStore";
import { useTranslation } from "react-i18next";
import type { Theme } from "@/theme";

export default function ProviderScreen() {
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation("bankSync");
  const { goCardlessConfigured, simpleFinConfigured } = useBankSyncStore();

  return (
    <View style={styles.container}>
      {goCardlessConfigured && (
        <ListItem
          title={t("provider.goCardless")}
          subtitle={t("provider.goCardlessDescription")}
          left={<Ionicons name="globe-outline" size={24} color={theme.colors.textSecondary} />}
          showChevron
          onPress={() => router.push("/(auth)/bank-sync/country")}
        />
      )}

      {simpleFinConfigured && (
        <ListItem
          title={t("provider.simpleFin")}
          subtitle={t("provider.simpleFinDescription")}
          left={<Ionicons name="card-outline" size={24} color={theme.colors.textSecondary} />}
          showChevron
          onPress={() => router.push("/(auth)/bank-sync/simplefin-accounts")}
        />
      )}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  description: {
    marginBottom: theme.spacing.sm,
  },
});
