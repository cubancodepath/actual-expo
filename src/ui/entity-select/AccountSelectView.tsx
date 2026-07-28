import { Fragment, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  ListGroup,
  Separator,
  Typography,
  useThemeColor,
  type SurfaceVariant,
} from "heroui-native";
import { Banknote, ChartSpline, Check } from "lucide-react-native";
import type { Account } from "@/core/types/models";
import { Money } from "@/ui/Money";
import { useAccountsWithBalances } from "@/ui/hooks/useAccountsWithBalances";

type Section = {
  key: "budget" | "offbudget";
  title: string;
  accounts: Account[];
};

interface AccountSelectViewProps {
  /** Currently assigned account — renders the check. */
  selectedAccountId?: string | null;
  onPick: (account: { id: string; name: string }) => void;
  /**
   * Balances re-fetch when this flips true (a sheet host ties it to its
   * opening). Defaults to true: fetch on mount.
   */
  enabled?: boolean;
  /** Hide this account from the list (e.g. the account being closed). */
  excludeAccountId?: string;
  /**
   * Fill of the row groups. Defaults to `"default"` (`bg-surface`), right on a
   * screen. A host that renders this inside a floating container — where the
   * canvas is `--overlay`, which equals `--surface` — must pass `"secondary"`
   * or the groups vanish into the sheet.
   */
  variant?: SurfaceVariant;
}

/**
 * THE account selector: grouped budget / off-budget list with balances.
 * Form-agnostic and self-contained on data; deliberately has NO scroll
 * container — hosts differ (the form's bottom sheet needs
 * `BottomSheetScrollView`, the move screen a `ScreenHeader.Body`), so the host
 * owns scrolling and this view renders just the sections.
 */
export function AccountSelectView({
  selectedAccountId = null,
  onPick,
  enabled = true,
  excludeAccountId,
}: AccountSelectViewProps) {
  const { t } = useTranslation("transactions");
  const accent = useThemeColor("accent");
  const foreground = useThemeColor("foreground");
  const accounts = useAccountsWithBalances(enabled);

  const sections = useMemo<Section[]>(() => {
    const visible = accounts.filter((a) => !a.closed && a.id !== excludeAccountId);
    const result: Section[] = [];
    const budget = visible.filter((a) => !a.offbudget);
    const offbudget = visible.filter((a) => a.offbudget);
    if (budget.length > 0) {
      result.push({
        key: "budget",
        title: t("budgetAccounts"),
        accounts: budget,
      });
    }
    if (offbudget.length > 0) {
      result.push({
        key: "offbudget",
        title: t("offBudgetAccounts"),
        accounts: offbudget,
      });
    }
    return result;
  }, [accounts, t, excludeAccountId]);

  return (
    <>
      {sections.map((section) => (
        <View key={section.key} className="mb-3">
          <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
            {section.title}
          </Typography>
          <ListGroup className="">
            {section.accounts.map((a, i) => (
              <Fragment key={a.id}>
                {i > 0 ? <Separator className="mx-4" /> : null}
                <ListGroup.Item onPress={() => onPick({ id: a.id, name: a.name })}>
                  <ListGroup.ItemPrefix>
                    <View className="flex-row items-center gap-3">
                      <View className="w-5 items-center justify-center">
                        {a.id === selectedAccountId ? <Check size={18} color={accent} /> : null}
                      </View>
                      <View className="size-9 items-center justify-center rounded-full bg-background">
                        {a.offbudget ? (
                          <ChartSpline size={18} color={foreground} />
                        ) : (
                          <Banknote size={18} color={foreground} />
                        )}
                      </View>
                    </View>
                  </ListGroup.ItemPrefix>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>{a.name}</ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                  <ListGroup.ItemSuffix>
                    <Money cents={a.balance ?? 0} className="text-sm" />
                  </ListGroup.ItemSuffix>
                </ListGroup.Item>
              </Fragment>
            ))}
          </ListGroup>
        </View>
      ))}
    </>
  );
}
