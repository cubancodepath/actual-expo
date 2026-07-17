import { Fragment } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { Button, ListGroup, Separator, Typography, useThemeColor } from "heroui-native";
import { CirclePlus, Plus } from "lucide-react-native";
import type { TransferEntry } from "@/screens/budget/hooks/useTransferFlow";
import { SourceRow } from "./SourceRow";

interface TransferEntryListProps {
  entries: TransferEntry[];
  /** Which way money flows for these rows — drives their projected balance chip. */
  flow: "gives" | "receives";
  editingId: string | null;
  onPressAmount: (id: string, pageY: number) => void;
  onAddCategory: () => void;
}

/**
 * The counterparts card of a transfer sheet: one editable row per category, with
 * "Add another" as the card's last, link-style row. Until there's anything to
 * show, the card gives way to a plain add button.
 */
export function TransferEntryList({
  entries,
  flow,
  editingId,
  onPressAmount,
  onAddCategory,
}: TransferEntryListProps) {
  const { t } = useTranslation("budget");
  const foreground = useThemeColor("foreground");
  const accent = useThemeColor("accent");

  if (entries.length === 0) {
    return (
      <Button variant="tertiary" onPress={onAddCategory}>
        <Plus size={18} color={foreground} />
        <Button.Label>{t("addCategory")}</Button.Label>
      </Button>
    );
  }

  return (
    <ListGroup className="overflow-hidden rounded-2xl">
      {entries.map((e, i) => (
        <Fragment key={e.id}>
          {i > 0 ? <Separator className="mx-4" /> : null}
          <SourceRow
            id={e.id}
            name={e.name}
            balance={e.balance}
            amount={e.amount}
            flow={flow}
            isEditing={editingId === e.id}
            onPressAmount={onPressAmount}
          />
        </Fragment>
      ))}
      <Separator className="mx-4" />
      <ListGroup.Item onPress={onAddCategory}>
        <View className="flex-1 flex-row items-center justify-center gap-2">
          <CirclePlus size={18} color={accent} />
          <Typography className="text-base font-semibold text-accent">{t("addAnother")}</Typography>
        </View>
      </ListGroup.Item>
    </ListGroup>
  );
}
