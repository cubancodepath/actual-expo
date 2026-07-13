import { Fragment, useMemo, useState } from "react";
import { View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useTranslation } from "react-i18next";
import { BottomSheet, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Banknote, ChartSpline, Check, Landmark } from "lucide-react-native";
import type { Account } from "@/core/domain/accounts/types";
import { CloseButton } from "@/ui/CloseButton";
import { Money } from "@/ui/Money";
import { ScreenHeader, useScreenHeaderScroll } from "@/ui/ScreenHeader";
import { useAccountsWithBalances } from "@/screens/transactions/hooks/useAccountsWithBalances";
import { FieldRow } from "../FieldRow";

type AccountFieldProps = {
  accountId: string | null;
  accountName: string;
  onSelect: (account: { id: string; name: string }) => void;
};

type Section = { key: "budget" | "offbudget"; title: string; accounts: Account[] };

/** Account picker row + resizable bottom sheet, grouped by budget / off-budget. */
export function AccountField({ accountId, accountName, onSelect }: AccountFieldProps) {
  const { t } = useTranslation("transactions");
  const [open, setOpen] = useState(false);

  return (
    <>
      <FieldRow
        icon={Landmark}
        label={t("account")}
        value={accountName}
        placeholder={t("selectAccount")}
        onPress={() => setOpen(true)}
      />
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            snapPoints={["55%", "90%"]}
            enableDynamicSizing={false}
            enableOverDrag={false}
            backgroundClassName="bg-background"
            contentContainerClassName="h-full px-0 pt-0"
          >
            <ScreenHeader.ScrollArea className="bg-transparent">
              <AccountSheetBody
                open={open}
                accountId={accountId}
                onSelect={(account) => {
                  onSelect(account);
                  setOpen(false);
                }}
              />
              <ScreenHeader.Floating>
                <ScreenHeader>
                  <ScreenHeader.Back>
                    <CloseButton onPress={() => setOpen(false)} />
                  </ScreenHeader.Back>
                  <ScreenHeader.Title>{t("account")}</ScreenHeader.Title>
                </ScreenHeader>
              </ScreenHeader.Floating>
            </ScreenHeader.ScrollArea>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}

/**
 * Sheet body: the grouped, scrollable account list. Split out so it can call
 * `useScreenHeaderScroll` (which needs the `ScreenHeader.ScrollArea` context) to
 * drive the floating header's blur and reserve top padding.
 */
function AccountSheetBody({
  open,
  accountId,
  onSelect,
}: {
  open: boolean;
  accountId: string | null;
  onSelect: (account: { id: string; name: string }) => void;
}) {
  const { t } = useTranslation("transactions");
  const accent = useThemeColor("accent");
  const foreground = useThemeColor("foreground");
  const { onScroll, contentPaddingTop } = useScreenHeaderScroll();
  const accounts = useAccountsWithBalances(open);

  const sections = useMemo<Section[]>(() => {
    const visible = accounts.filter((a) => !a.closed);
    const result: Section[] = [];
    const budget = visible.filter((a) => !a.offbudget);
    const offbudget = visible.filter((a) => a.offbudget);
    if (budget.length > 0) {
      result.push({ key: "budget", title: t("budgetAccounts"), accounts: budget });
    }
    if (offbudget.length > 0) {
      result.push({ key: "offbudget", title: t("offBudgetAccounts"), accounts: offbudget });
    }
    return result;
  }, [accounts, t]);

  return (
    <BottomSheetScrollView
      onScroll={onScroll}
      contentContainerStyle={{
        paddingTop: contentPaddingTop,
        paddingHorizontal: 16,
        paddingBottom: 24,
      }}
    >
      {sections.map((section) => (
        <View key={section.key} className="mb-3">
          <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
            {section.title}
          </Typography>
          <ListGroup>
            {section.accounts.map((a, i) => (
              <Fragment key={a.id}>
                {i > 0 ? <Separator className="mx-4" /> : null}
                <ListGroup.Item onPress={() => onSelect({ id: a.id, name: a.name })}>
                  <ListGroup.ItemPrefix>
                    <View className="flex-row items-center gap-3">
                      <View className="w-5 items-center justify-center">
                        {a.id === accountId ? <Check size={18} color={accent} /> : null}
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
    </BottomSheetScrollView>
  );
}
