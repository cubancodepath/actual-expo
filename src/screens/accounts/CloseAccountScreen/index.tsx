import { Fragment, useMemo, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { ChevronLeft } from "lucide-react-native";
import { closeAccount, getAccountProperties, type CloseAccountOpts } from "@/core/domain/accounts";
import type { Account } from "@/core/types/models";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { useCategories } from "@/lib/hooks/useCategories";
import { formatBalance } from "@/lib/format";
import { useUndoStore } from "@/stores/undoStore";
import { dialog } from "@/ui/feedback/dialog";
import { LoadingScreen } from "@/ui/LoadingScreen";
import { CloseButton } from "@/ui/CloseButton";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { AccountSelectView } from "@/ui/entity-select/AccountSelectView";

/**
 * Close account — migrated to the new arch. Self-contained (no pickerStore): the
 * transfer-account picker and, when needed, the category list are hosted inline
 * with local callbacks; confirmation is an Alert dialog. Domain (`closeAccount`)
 * already mirrors upstream's three cases exactly.
 */
export function CloseAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accounts } = useAccounts();
  const account = accounts.find((a) => a.id === id);

  const propsQuery = useQuery({
    queryKey: ["account-properties", id],
    queryFn: () => getAccountProperties(id),
    enabled: !!id,
  });

  if (!account || propsQuery.isLoading || !propsQuery.data) {
    return <LoadingScreen />;
  }

  return (
    <CloseAccountForm
      account={account}
      balance={propsQuery.data.balance}
      numTransactions={propsQuery.data.numTransactions}
    />
  );
}

function CloseAccountForm({
  account,
  balance,
  numTransactions,
}: {
  account: Account;
  balance: number;
  numTransactions: number;
}) {
  const { t } = useTranslation("accounts");
  const router = useRouter();
  const foreground = useThemeColor("foreground");
  const danger = useThemeColor("danger");
  const { accounts } = useAccounts();

  const canDelete = numTransactions === 0;
  const [transferAccount, setTransferAccount] = useState<{ id: string; name: string } | null>(null);
  const [inCategoryStep, setInCategoryStep] = useState(false);

  const closeMutation = useMutation({
    mutationFn: (opts: CloseAccountOpts) => closeAccount(opts),
    onSuccess: (_data, opts) => {
      const deleted = opts.forced || canDelete;
      useUndoStore.getState().showUndo(t(deleted ? "close.accountDeleted" : "close.accountClosed"));
      router.dismiss();
    },
  });

  async function confirmClose(opts: CloseAccountOpts, destructive = false) {
    const ok = await dialog.confirm({
      title: destructive ? t("close.forceCloseTitle") : t("close.title"),
      message: destructive
        ? t("close.forceCloseMessage", { name: account.name })
        : `${t("close.confirmMessage")}"${account.name}"?`,
      confirmLabel: destructive ? t("close.forceClose") : t("close.title"),
      destructive,
    });
    if (ok) closeMutation.mutate(opts);
  }

  /** Transferring from an on-budget account into an off-budget one needs a category. */
  function needsCategory(destId: string): boolean {
    const dest = accounts.find((a) => a.id === destId);
    return !!dest?.offbudget && !account.offbudget;
  }

  function onPickAccount(picked: { id: string; name: string }) {
    setTransferAccount(picked);
    if (needsCategory(picked.id)) {
      setInCategoryStep(true);
    } else {
      confirmClose({ id: account.id, transferAccountId: picked.id });
    }
  }

  function onPickCategory(categoryId: string) {
    if (!transferAccount) return;
    confirmClose({ id: account.id, transferAccountId: transferAccount.id, categoryId });
  }

  function forceClose() {
    confirmClose({ id: account.id, forced: true }, true);
  }

  const showForceClose = numTransactions > 0;

  return (
    <ScreenHeader.ScrollArea>
      <ScreenHeader.Body contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        {balance === 0 ? (
          <View className="gap-4 pt-2">
            <Typography className="text-sm text-muted">
              {`${t("close.confirmMessage")}"${account.name}". `}
              {canDelete ? t("close.noTransactions") : t("close.hasTransactions")}
            </Typography>
            <Button onPress={() => confirmClose({ id: account.id })}>
              <Button.Label>{t("close.title")}</Button.Label>
            </Button>
            {showForceClose ? <ForceCloseButton danger={danger} onPress={forceClose} /> : null}
          </View>
        ) : !inCategoryStep ? (
          <View className="pt-2">
            <Typography className="mb-3 text-sm text-muted">
              {t("close.balanceTransferMessage", { balance: formatBalance(balance) })}
            </Typography>
            <AccountSelectView excludeAccountId={account.id} onPick={onPickAccount} />
            {showForceClose ? (
              <View className="mt-4">
                <ForceCloseButton danger={danger} onPress={forceClose} />
              </View>
            ) : null}
          </View>
        ) : (
          <View className="pt-2">
            <Typography className="mb-3 text-sm text-muted">
              {t("close.categoryTransferMessage")}
            </Typography>
            <ExpenseCategoryList onPick={onPickCategory} />
          </View>
        )}
      </ScreenHeader.Body>

      <ScreenHeader.Floating>
        <ScreenHeader>
          <ScreenHeader.Back>
            {inCategoryStep ? (
              <Button
                variant="secondary"
                isIconOnly
                className="rounded-full"
                onPress={() => setInCategoryStep(false)}
              >
                <ChevronLeft size={24} color={foreground} />
              </Button>
            ) : (
              <CloseButton onPress={() => router.dismiss()} />
            )}
          </ScreenHeader.Back>
          <ScreenHeader.Title>{t("close.title")}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}

function ForceCloseButton({ danger, onPress }: { danger: string; onPress: () => void }) {
  const { t } = useTranslation("accounts");
  return (
    <Button variant="ghost" onPress={onPress}>
      <Button.Label style={{ color: danger }}>{t("close.forceClose")}</Button.Label>
    </Button>
  );
}

/** Bare grouped list of expense categories, picked inline (no pickerStore). */
function ExpenseCategoryList({ onPick }: { onPick: (categoryId: string) => void }) {
  const { t } = useTranslation("accounts");
  const { categories, groups } = useCategories();

  const grouped = useMemo(() => {
    return groups
      .filter((g) => !g.is_income)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((g) => ({
        id: g.id,
        name: g.name,
        categories: categories
          .filter((c) => c.cat_group === g.id && !c.is_income && !c.hidden && !c.tombstone)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }))
      .filter((g) => g.categories.length > 0);
  }, [categories, groups]);

  return (
    <>
      {grouped.map((group) => (
        <View key={group.id} className="mb-3">
          <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
            {group.name}
          </Typography>
          <ListGroup>
            {group.categories.map((c, i) => (
              <Fragment key={c.id}>
                {i > 0 ? <Separator className="mx-4" /> : null}
                <ListGroup.Item onPress={() => onPick(c.id)}>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>{c.name}</ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                </ListGroup.Item>
              </Fragment>
            ))}
          </ListGroup>
        </View>
      ))}
      {grouped.length === 0 ? (
        <Typography className="py-6 text-center text-base text-muted">
          {t("close.categoryRequired")}
        </Typography>
      ) : null}
    </>
  );
}
