import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { listLocalBudgets, type BudgetMetadata } from "@/services/budgetMetadata";
import { openBudget } from "@/services/budgetfiles";
import { usePrefsStore } from "@/stores/prefsStore";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text, Card, SectionHeader, Button, BudgetFileRow } from "@/presentation/components";
import { BudgetSetupWizard } from "@/presentation/components/budget/BudgetSetupWizard";
import type { ReconciledBudgetFile } from "@/services/budgetfiles";
import type { Theme } from "@/theme";

type ScreenState = "loading" | "picker" | "wizard";

function metadataToFile(meta: BudgetMetadata): ReconciledBudgetFile {
  return {
    state: meta.cloudFileId ? "detached" : "local",
    localId: meta.id,
    cloudFileId: meta.cloudFileId,
    name: meta.budgetName,
    groupId: meta.groupId,
    lastOpened: meta.lastOpened,
  };
}

export default function LocalSetupScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation("common");

  const [screen, setScreen] = useState<ScreenState>("loading");
  const [budgets, setBudgets] = useState<BudgetMetadata[]>([]);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    listLocalBudgets().then((list) => {
      setBudgets(list);
      setScreen(list.length > 0 ? "picker" : "wizard");
    });
  }, []);

  async function handleSelectBudget(meta: BudgetMetadata) {
    setSelecting(meta.id);
    try {
      await openBudget(meta.id);
      usePrefsStore.getState().setPrefs({
        isLocalOnly: true,
        activeBudgetId: meta.id,
        budgetName: meta.budgetName,
      });
    } catch {
      setSelecting(null);
    }
  }

  if (screen === "loading") {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (screen === "wizard") {
    return (
      <BudgetSetupWizard
        mode="local"
        onCancel={() => {
          if (budgets.length > 0) {
            setScreen("picker");
          } else {
            router.back();
          }
        }}
      />
    );
  }

  // Picker: show existing budgets
  const files = budgets.map(metadataToFile);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingBottom: insets.bottom + spacing.xl,
        paddingTop: insets.top + spacing.lg,
      }}
    >
      <SectionHeader title={t("yourBudgets")} style={{ marginBottom: spacing.sm }} />
      <Card style={styles.listCard}>
        {files.map((file, index) => (
          <BudgetFileRow
            key={file.localId}
            file={file}
            isSelecting={selecting === file.localId}
            onPress={() => handleSelectBudget(budgets[index])}
            showSeparator={index < files.length - 1}
          />
        ))}
      </Card>

      <Text
        variant="bodySm"
        color={colors.textMuted}
        style={{ textAlign: "center", marginTop: spacing.xl, marginBottom: spacing.sm }}
      >
        {t("orCreateNew")}
      </Text>

      <Button
        title={t("createNewBudget")}
        buttonStyle="borderedSecondary"
        onPress={() => setScreen("wizard")}
        style={{ marginHorizontal: spacing.lg }}
      />

      <Button
        title={tc("back")}
        buttonStyle="borderless"
        onPress={() => router.back()}
        style={{ marginTop: spacing.sm, marginHorizontal: spacing.lg }}
      />
    </ScrollView>
  );
}

const createStyles = (theme: Theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    paddingHorizontal: theme.spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.colors.pageBackground,
  },
  listCard: {
    padding: 0,
    overflow: "hidden" as const,
  },
});
