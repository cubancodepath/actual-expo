import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Spinner, Typography, useThemeColor } from "heroui-native";
import { getBudgets, type BudgetMetadata } from "@/services/budgetMetadata";
import { loadBudget, type ReconciledBudgetFile } from "@/services/budgetfiles";
import { useBudgetContextStore } from "@/stores/budgetContextStore";
import { BudgetFileRow } from "@/ui/BudgetFileRow";
import { BudgetSetupWizard } from "@/screens/auth/components/BudgetSetupWizard";

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

/** Local-only setup: pick an existing on-device budget or create a new one. */
export function LocalSetupScreen() {
  const router = useRouter();
  const { t } = useTranslation("auth");
  const accent = useThemeColor("accent");

  const [screen, setScreen] = useState<ScreenState>("loading");
  const [budgets, setBudgets] = useState<BudgetMetadata[]>([]);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    getBudgets().then((list) => {
      setBudgets(list);
      setScreen(list.length > 0 ? "picker" : "wizard");
    });
  }, []);

  async function handleSelectBudget(meta: BudgetMetadata) {
    setSelecting(meta.id);
    try {
      await loadBudget(meta.id);
      useBudgetContextStore.getState().setBudgetContext({
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
      <View className="flex-1 items-center justify-center bg-background">
        <Spinner color={accent} />
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
    <ScrollView className="flex-1 bg-background px-6" contentContainerClassName="pt-24 pb-16">
      <Typography
        type="body-xs"
        weight="semibold"
        color="muted"
        className="uppercase tracking-wide mb-2 ml-1"
      >
        {t("yourBudgets")}
      </Typography>
      <ListGroup className="overflow-hidden">
        {files.map((file, index) => (
          <BudgetFileRow
            key={file.localId}
            file={file}
            isSelecting={selecting === file.localId}
            onPress={() => handleSelectBudget(budgets[index])}
            showSeparator={index < files.length - 1}
          />
        ))}
      </ListGroup>

      <Typography type="body-sm" color="muted" className="text-center mt-8 mb-3">
        {t("orCreateNew")}
      </Typography>

      <Button variant="outline" size="lg" onPress={() => setScreen("wizard")}>
        <Button.Label>{t("createNewBudget")}</Button.Label>
      </Button>
    </ScrollView>
  );
}
