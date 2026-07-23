import { Fragment, memo, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Accordion, ListGroup, Separator, Typography } from "heroui-native";
import type { AccountGroup } from "@/core/server/accounts";
import type { Account } from "@/core/types/models";
import { Money } from "@/ui/Money";
import { useAccountGroupBalance } from "@/lib/hooks/useAccounts";
import { CollapsibleIndicator } from "@/ui/CollapsibleIndicator";
import { AccountRow, type RowRect } from "./AccountRow";

interface AccountGroupItemProps {
  group: AccountGroup;
  onPressAccount: (account: Account) => void;
  onLongPressAccount: (account: Account, rect: RowRect) => void;
  /** The account id whose menu preview is currently floating, if any. */
  liftedAccountId: string | null;
}

/**
 * One collapsible account group (On Budget / Off Budget / Closed). The trigger
 * shows the group label and its live total; the content is a `ListGroup` of
 * account rows. Memoised — `group` is a stable ref from `groupAccounts`.
 */
export const AccountGroupItem = memo(function AccountGroupItem({
  group,
  onPressAccount,
  onLongPressAccount,
  liftedAccountId,
}: AccountGroupItemProps) {
  const { t } = useTranslation("accounts");
  const accountIds = useMemo(() => group.accounts.map((a) => a.id), [group.accounts]);
  const total = useAccountGroupBalance(accountIds);

  const label =
    group.type === "budget"
      ? t("groups.budgetAccounts")
      : group.type === "closed"
        ? t("groups.closedAccounts")
        : t("groups.offBudget");

  return (
    <Accordion.Item value={group.type} className="mb-4">
      <Accordion.Trigger className="px-1 py-1.5">
        <View className="flex-1 flex-row items-center gap-2">
          <CollapsibleIndicator />
          <View className="flex-1">
            <Typography className="text-sm font-semibold text-foreground" numberOfLines={1}>
              {label}
            </Typography>
          </View>
          {/* Closed accounts are always zeroed out on close — no total to show. */}
          {group.type !== "closed" ? (
            <Money cents={total} tone="plain" className="text-sm font-semibold" />
          ) : null}
        </View>
      </Accordion.Trigger>

      <Accordion.Content className="px-0 pb-0">
        <ListGroup>
          {group.accounts.map((account, i) => (
            <Fragment key={account.id}>
              {i > 0 ? <Separator className="mx-4" /> : null}
              <AccountRow
                account={account}
                onPress={onPressAccount}
                onLongPress={onLongPressAccount}
                isLifted={liftedAccountId === account.id}
              />
            </Fragment>
          ))}
        </ListGroup>
      </Accordion.Content>
    </Accordion.Item>
  );
});
