import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useThemeColor } from "heroui-native";
import { CirclePlus } from "lucide-react-native";
import { groupByInitial } from "@/lib/groupByInitial";
import { NativePickerScreen } from "@/ui/NativePickerScreen";
import { PickerSection } from "@/ui/picker/PickerSection";
import { PickerCheck, PickerRow } from "@/ui/picker/PickerRow";
import { PickerActionRow } from "@/ui/picker/PickerActionRow";
import { usePickerSearch } from "@/ui/picker/usePickerSearch";
import { usePayees } from "@/lib/hooks/usePayees";
import type { Payee } from "@/core/types/models";

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
  const { t } = useTranslation("transactions");
  const accent = useThemeColor("accent");
  const { payees } = usePayees();

  /** A free-text payee (created via "Create X"): no id, but a name. */
  const isCreatedPayee = selectedPayeeId == null && selectedPayeeName.trim() !== "";
  const { query, setQuery, q, searching, clear } = usePickerSearch(
    isCreatedPayee ? selectedPayeeName : "",
  );

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
      clear();
    } else {
      onPick({ id: null, name: query.trim() });
    }
  };

  const payeeRows = (items: Payee[]) =>
    items.map((p, i) => (
      <PickerRow
        key={p.id}
        index={i}
        title={p.name}
        onPress={() => toggleReal(p)}
        suffix={p.id === selectedPayeeId ? <PickerCheck isSelected /> : undefined}
      />
    ));

  return (
    <NativePickerScreen
      title={t("payee")}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder={t("searchPayees")}
    >
      {searching && !exact ? (
        <PickerActionRow
          title={t("createPayee", { name: query.trim() })}
          prefix={<CirclePlus size={18} color={accent} />}
          suffix={createIsSelected ? <PickerCheck isSelected /> : undefined}
          onPress={onCreateRow}
        />
      ) : null}

      {searching ? (
        list.length > 0 ? (
          <PickerSection>{payeeRows(list)}</PickerSection>
        ) : null
      ) : (
        sections.map((section) => (
          <PickerSection key={section.letter} title={section.letter}>
            {payeeRows(section.items)}
          </PickerSection>
        ))
      )}
    </NativePickerScreen>
  );
}
