import { useMemo, useState } from "react";
import { Pressable, View, useColorScheme } from "react-native";
import { Host, List, Section } from "@expo/ui/swift-ui";
import { listStyle } from "@expo/ui/swift-ui/modifiers";
import { Text } from "@/presentation/components/atoms/Text";
import { Amount } from "@/presentation/components/atoms/Amount";
import { useTheme } from "@/presentation/providers/ThemeProvider";
import { useCategories } from "@/presentation/hooks/useCategories";
import { useSheetValueNumber } from "@/presentation/hooks/useSheetValue";
import { sheetForMonth, envelopeBudget } from "@core/spreadsheet/bindings";
import { useBudgetUIStore } from "@/stores/budgetUIStore";
interface GroupInfo {
  id: string;
  name: string;
  is_income: boolean;
}

// ---------------------------------------------------------------------------
// Group header (reads spreadsheet values for totals)
// ---------------------------------------------------------------------------

function GroupHeader({ group, sheet }: { group: GroupInfo; sheet: string }) {
  const { colors } = useTheme();
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.groupBudgeted(group.id));
  const spent = useSheetValueNumber(sheet, envelopeBudget.groupSpent(group.id));
  const balance = useSheetValueNumber(sheet, envelopeBudget.groupBalance(group.id));

  const balanceColor = group.is_income
    ? colors.positive
    : balance < 0
      ? colors.negative
      : balance > 0
        ? colors.positive
        : colors.textMuted;
  const balanceValue = group.is_income ? spent : balance;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 2 }}>
      <Text
        variant="captionSm"
        color={colors.textSecondary}
        style={{ flex: 1, textTransform: "uppercase", letterSpacing: 0.8, fontWeight: "700" }}
        numberOfLines={1}
      >
        {group.name}
      </Text>
      {!group.is_income && (
        <Amount
          value={budgeted}
          variant="caption"
          color={budgeted !== 0 ? colors.textSecondary : colors.textMuted}
          weight="600"
          style={{ fontVariant: ["tabular-nums"], marginRight: 8 }}
        />
      )}
      <Amount
        value={balanceValue}
        variant="caption"
        color={balanceColor}
        weight="600"
        style={{ fontVariant: ["tabular-nums"] }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Category row (reads spreadsheet values per category)
// ---------------------------------------------------------------------------

function CategoryRow({
  catId,
  catName,
  sheet,
  isIncome,
}: {
  catId: string;
  catName: string;
  sheet: string;
  isIncome: boolean;
}) {
  const { colors } = useTheme();
  const budgeted = useSheetValueNumber(sheet, envelopeBudget.catBudgeted(catId));
  const spent = useSheetValueNumber(sheet, envelopeBudget.catSpent(catId));
  const balance = useSheetValueNumber(sheet, envelopeBudget.catBalance(catId));

  const pillBg =
    balance < 0
      ? colors.negativeSubtle
      : balance > 0
        ? colors.positiveSubtle
        : colors.warningSubtle;
  const pillText = balance < 0 ? colors.negative : balance > 0 ? colors.positive : colors.textMuted;

  if (isIncome) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
        <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
          {catName}
        </Text>
        <Amount value={spent} variant="body" color={colors.positive} weight="500" />
      </View>
    );
  }

  return (
    <Pressable style={{ flexDirection: "row", alignItems: "center", paddingVertical: 6 }}>
      <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
        {catName}
      </Text>
      <Amount
        value={budgeted}
        variant="caption"
        color={budgeted !== 0 ? colors.textPrimary : colors.textMuted}
        weight="600"
        numberOfLines={1}
        style={{ fontVariant: ["tabular-nums"], width: 80, textAlign: "right" }}
      />
      <View
        style={{
          backgroundColor: pillBg,
          borderRadius: 100,
          paddingHorizontal: 8,
          paddingVertical: 2,
          marginLeft: 6,
        }}
      >
        <Amount
          value={balance}
          variant="caption"
          color={pillText}
          weight="700"
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontVariant: ["tabular-nums"] }}
        />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function SwiftUIListScreen() {
  const { colors } = useTheme();
  const scheme = useColorScheme();
  const month = useBudgetUIStore((s) => s.month);
  const sheet = sheetForMonth(month);
  const { categories, groups: rawGroups } = useCategories();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Build groups with their categories
  const budgetGroups = useMemo(() => {
    if (rawGroups.length === 0) return [];
    const sortedGroups = [...rawGroups]
      .filter((g) => !g.hidden)
      .sort((a, b) => {
        if (a.is_income !== b.is_income) return a.is_income ? 1 : -1;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });

    return sortedGroups.map((g) => {
      const groupCats = categories
        .filter((c) => c.cat_group === g.id && !c.hidden)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      return { ...g, categories: groupCats };
    });
  }, [categories, rawGroups]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <Host style={{ flex: 1 }} colorScheme={scheme === "dark" ? "dark" : "light"}>
        <List modifiers={[listStyle("sidebar")]}>
          {budgetGroups.map((group) => (
            <Section
              key={group.id}
              isExpanded={!collapsed.has(group.id)}
              onIsExpandedChange={(expanded) => {
                if (!expanded) {
                  setCollapsed((prev) => new Set(prev).add(group.id));
                } else {
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    next.delete(group.id);
                    return next;
                  });
                }
              }}
              header={<GroupHeader group={group} sheet={sheet} />}
            >
              {group.categories.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  catId={cat.id}
                  catName={cat.name}
                  sheet={sheet}
                  isIncome={group.is_income}
                />
              ))}
            </Section>
          ))}
        </List>
      </Host>
    </View>
  );
}
