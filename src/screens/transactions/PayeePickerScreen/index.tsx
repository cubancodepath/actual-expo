import { Fragment, useMemo, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSelector } from "@tanstack/react-store";
import { ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Check, CirclePlus } from "lucide-react-native";
import { groupByInitial } from "@/lib/groupByInitial";
import { PickerScreen } from "@/screens/transactions/components/PickerScreen";
import { useTransactionForm } from "@/screens/transactions/NewTransactionScreen/context/TransactionFormProvider";
import type { PayeeSelection } from "@/screens/transactions/NewTransactionScreen/hooks/useNewTransactionForm";
import type { Payee } from "@/core/domain/payees/types";

/** Full-screen searchable payee picker. Reads/writes the shared transaction form. */
export function PayeePickerScreen() {
  const { t } = useTranslation("transactions");
  const router = useRouter();
  const accent = useThemeColor("accent");

  const { form, payees, actions } = useTransactionForm();
  const payeeId = useSelector(form.store, (s) => s.values.payeeId);
  const payeeName = useSelector(form.store, (s) => s.values.payeeName);

  /** A free-text payee (created via "Create X"): no id, but a name. */
  const isCreatedPayee = payeeId == null && payeeName.trim() !== "";

  // Re-entering with a created payee: seed the search with its name so the
  // "Create X" row shows up (marked selected) instead of the plain list.
  const [query, setQuery] = useState(() => (isCreatedPayee ? payeeName : ""));
  const q = query.trim().toLowerCase();
  const searching = q !== "";

  const list = useMemo(
    () => payees.filter((p) => !p.tombstone && (q === "" || p.name.toLowerCase().includes(q))),
    [payees, q],
  );
  const exact = useMemo(() => list.some((p) => p.name.toLowerCase() === q), [list, q]);
  // Alphabetical sections only when browsing; search results stay a flat list.
  const sections = useMemo(
    () => (searching ? [] : groupByInitial(list, (p) => p.name)),
    [list, searching],
  );

  // The typed term is the currently-selected created payee → the Create row acts
  // as its selected state.
  const createIsSelected =
    payeeId == null && query.trim() !== "" && query.trim() === payeeName.trim();

  const clear = () => actions.selectPayee({ id: null, name: "" });

  // Real payee row = toggle: tap the selected one to clear it. Always closes.
  const toggleReal = (p: Payee) => {
    if (p.id === payeeId) clear();
    else
      actions.selectPayee({
        id: p.id,
        name: p.name,
        transferAcct: p.transfer_acct,
      });
    router.back();
  };

  const onCreateRow = () => {
    if (createIsSelected) {
      // Selected created payee → clear it + drop the search, back to the list.
      clear();
      setQuery("");
    } else {
      actions.selectPayee({
        id: null,
        name: query.trim(),
      } satisfies PayeeSelection);
      router.back();
    }
  };

  const payeeGroup = (items: Payee[]) => (
    <ListGroup>
      {items.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 ? <Separator className="mx-4" /> : null}
          <ListGroup.Item onPress={() => toggleReal(p)}>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{p.name}</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            {p.id === payeeId ? (
              <ListGroup.ItemSuffix>
                <Check size={18} color={accent} />
              </ListGroup.ItemSuffix>
            ) : null}
          </ListGroup.Item>
        </Fragment>
      ))}
    </ListGroup>
  );

  return (
    <PickerScreen
      title={t("payee")}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={t("searchPayees")}
    >
      {/* "Create X" row — appears while searching with no exact real match. Doubles
          as the selected state (with a check) when X is the current created payee. */}
      {searching && !exact ? (
        <ListGroup className="mb-3">
          <ListGroup.Item onPress={onCreateRow}>
            <ListGroup.ItemPrefix>
              <CirclePlus size={18} color={accent} />
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle className="text-accent">
                {t("createPayee", { name: query.trim() })}
              </ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            {createIsSelected ? (
              <ListGroup.ItemSuffix>
                <Check size={18} color={accent} />
              </ListGroup.ItemSuffix>
            ) : null}
          </ListGroup.Item>
        </ListGroup>
      ) : null}

      {searching
        ? list.length > 0
          ? payeeGroup(list)
          : null
        : sections.map((section) => (
            <View key={section.letter} className="mb-3">
              <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
                {section.letter}
              </Typography>
              {payeeGroup(section.items)}
            </View>
          ))}
    </PickerScreen>
  );
}
