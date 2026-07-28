import { Fragment, useMemo, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { Check, CirclePlus } from "lucide-react-native";
import { groupByInitial } from "@/lib/groupByInitial";
import { PickerScreen } from "@/ui/PickerScreen";
import { usePayees } from "@/lib/hooks/usePayees";
import type { Payee } from "@/core/types/models";
import { useSurfaceLevel } from "@/ui/surface-level";

/** A payee choice: a real payee (`id`) or a free-text created one (`id: null`). */
export type PayeePick = { id: string | null; name: string; transferAcct?: string | null };

interface PayeeSelectViewProps {
  /** Currently selected payee id — renders the check. */
  selectedPayeeId?: string | null;
  /** Current payee name — seeds the search for a created (free-text) payee. */
  selectedPayeeName?: string;
  /**
   * A pick, or `null` when the user taps the already-selected one (deselect).
   * The view never navigates — the caller decides what happens.
   */
  onPick: (payee: PayeePick | null) => void;
}

/**
 * THE payee selector: full-screen searchable, alphabetically-sectioned picker
 * with a "Create X" row for free-text payees. Form-agnostic and self-contained
 * on data (payees come from its own hook) — flows plug it in through `onPick`
 * and own all navigation and persistence themselves. Mirrors AccountSelectView
 * / CategorySelectView.
 */
export function PayeeSelectView({
  selectedPayeeId = null,
  selectedPayeeName = "",
  onPick,
}: PayeeSelectViewProps) {
  const { itemVariant } = useSurfaceLevel();
  const { t } = useTranslation("transactions");
  const accent = useThemeColor("accent");
  const { payees } = usePayees();

  /** A free-text payee (created via "Create X"): no id, but a name. */
  const isCreatedPayee = selectedPayeeId == null && selectedPayeeName.trim() !== "";

  const [query, setQuery] = useState(() => (isCreatedPayee ? selectedPayeeName : ""));
  const q = query.trim().toLowerCase();
  const searching = q !== "";

  const list = useMemo(
    () => payees.filter((p) => !p.tombstone && (q === "" || p.name.toLowerCase().includes(q))),
    [payees, q],
  );
  const exact = useMemo(() => list.some((p) => p.name.toLowerCase() === q), [list, q]);
  const sections = useMemo(
    () => (searching ? [] : groupByInitial(list, (p) => p.name)),
    [list, searching],
  );

  const createIsSelected =
    selectedPayeeId == null && query.trim() !== "" && query.trim() === selectedPayeeName.trim();

  // Real payee row = toggle: tap the selected one to clear it.
  const toggleReal = (p: Payee) => {
    if (p.id === selectedPayeeId) onPick(null);
    else onPick({ id: p.id, name: p.name, transferAcct: p.transfer_acct });
  };

  const onCreateRow = () => {
    if (createIsSelected) {
      onPick(null);
      setQuery("");
    } else {
      onPick({ id: null, name: query.trim() });
    }
  };

  const payeeGroup = (items: Payee[]) => (
    <ListGroup variant={itemVariant}>
      {items.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 ? <Separator className="mx-4" /> : null}
          <ListGroup.Item onPress={() => toggleReal(p)}>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{p.name}</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            {p.id === selectedPayeeId ? (
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
      {searching && !exact ? (
        <ListGroup variant={itemVariant} className="mb-3">
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
