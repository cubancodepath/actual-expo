import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Chip, PressableFeedback, Typography } from "heroui-native";
import { sheetForMonth } from "@/core/server/spreadsheet/bindings";
import { useBudgetMonth } from "@/screens/budget/hooks/useBudgetMonth";
import {
  useOverspentCategories,
  type OverspentCategory,
} from "@/screens/budget/hooks/useOverspentCategories";
import { Money } from "@/ui/Money";
import { SurfaceCanvas } from "@/ui/surface-level";

/**
 * First step of the cover-overspent flow, presented as a fixed-height sheet.
 * Header (title + subtitle, left-aligned, no close button — swipe to dismiss)
 * scrolls with the content: the sheet's root must be a ScrollView, a plain
 * flex container collapses inside a formSheet with a custom detent. Each
 * category is a default-chip pill; tapping pushes cover-source.
 */
export function CoverOverspentScreen() {
  const router = useRouter();
  const { t } = useTranslation("budget");
  const { t: tc } = useTranslation();
  const { month } = useBudgetMonth();
  const sheet = sheetForMonth(month);
  const overspent = useOverspentCategories(sheet);

  const handleSelect = (cat: OverspentCategory) => {
    router.push({
      pathname: "/(auth)/budget/cover-source",
      params: { catId: cat.id, catName: cat.name, balance: String(cat.balance) },
    });
  };

  return (
    <SurfaceCanvas context="sheet" className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <View className="pb-4 pt-5">
          <Typography className="text-lg font-semibold text-foreground">
            {tc("nav.overspentCategories")}
          </Typography>
          <Typography className="mt-0.5 text-sm text-muted">
            {t("selectCategoryTocover")}
          </Typography>
        </View>

        <View className="gap-2">
          {overspent.map((cat) => (
            <PressableFeedback
              key={cat.id}
              animation={false}
              onPress={() => handleSelect(cat)}
              accessibilityLabel={t("coverOverspendingAccessibility", { name: cat.name })}
            >
              <PressableFeedback.Scale>
                {/* The Chip renders its own Pressable — pointerEvents="none" lets the
                  touch fall through to the PressableFeedback wrapper. */}
                <Chip
                  variant="secondary"
                  color="default"
                  size="lg"
                  pointerEvents="none"
                  className="w-full justify-between px-4 py-4"
                >
                  <Chip.Label
                    className="flex-1 text-sm font-medium text-foreground"
                    numberOfLines={1}
                  >
                    {cat.name}
                  </Chip.Label>
                  <Chip variant="primary" color="danger" size="sm">
                    <Money
                      cents={cat.balance}
                      tone="plain"
                      className="text-xs font-semibold text-danger-foreground"
                    />
                  </Chip>
                </Chip>
              </PressableFeedback.Scale>
              <PressableFeedback.Highlight className="rounded-3xl" />
            </PressableFeedback>
          ))}
        </View>
      </ScrollView>
    </SurfaceCanvas>
  );
}
