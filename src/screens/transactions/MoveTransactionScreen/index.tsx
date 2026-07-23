import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { LoadingScreen } from "@/ui/LoadingScreen";
import { getTransactionById, moveTransaction } from "@/core/server/transactions";
import { emitErrorEvent } from "@/lib/errors/ErrorChannel";
import { CloseButton } from "@/ui/CloseButton";
import { ScreenHeader } from "@/ui/ScreenHeader";
import { AccountSelectView } from "@/ui/entity-select/AccountSelectView";
import type { TransactionDisplay } from "@/core/types/models";

/**
 * "Move to Account" from the transactions list: the shared account selector,
 * full screen from the start (no sheet to drag up), with pick → apply → close
 * semantics. Splits cascade to their children via `moveTransaction`.
 */
export function MoveTransactionScreen() {
  const { t } = useTranslation("transactions");
  const router = useRouter();
  const { transactionId } = useLocalSearchParams<{ transactionId: string }>();

  const [txn, setTxn] = useState<TransactionDisplay | null>(null);
  useEffect(() => {
    let alive = true;
    getTransactionById(transactionId)
      .then((loaded) => alive && setTxn(loaded))
      .catch((e) => emitErrorEvent(e, { operation: "transaction.move.load" }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Errors are reported to the bus by the global MutationCache.onError.
  const moveMutation = useMutation({
    mutationFn: (accountId: string) => moveTransaction(transactionId, accountId),
    onSuccess: () => router.dismiss(),
  });

  if (!txn) {
    return <LoadingScreen />;
  }

  return (
    <ScreenHeader.ScrollArea>
      {/* Body wires its own scroll → header blur and top padding. */}
      <ScreenHeader.Body contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
        <AccountSelectView
          selectedAccountId={txn.account}
          onPick={(account) => {
            if (account.id === txn.account) {
              router.dismiss(); // same account — nothing to write
            } else if (!moveMutation.isPending) {
              moveMutation.mutate(account.id);
            }
          }}
        />
      </ScreenHeader.Body>
      <ScreenHeader.Floating>
        <ScreenHeader>
          <ScreenHeader.Back>
            <CloseButton onPress={() => router.dismiss()} />
          </ScreenHeader.Back>
          <ScreenHeader.Title>{t("account")}</ScreenHeader.Title>
        </ScreenHeader>
      </ScreenHeader.Floating>
    </ScreenHeader.ScrollArea>
  );
}
