import { useTranslation } from "react-i18next";
import { Segment } from "heroui-native-pro";
import type { TransactionType } from "../validation/transactionForm.schema";

type TypeSegmentProps = {
  value: TransactionType;
  onChange: (type: TransactionType) => void;
};

/** Expense / income selector built on the HeroUI Pro Segment. */
export function TypeSegment({ value, onChange }: TypeSegmentProps) {
  const { t } = useTranslation("transactions");
  return (
    <Segment value={value} onValueChange={(v) => onChange(v as TransactionType)}>
      <Segment.Group>
        <Segment.Indicator />
        <Segment.Item value="expense">
          <Segment.Label>{t("expense")}</Segment.Label>
        </Segment.Item>
        <Segment.Item value="income">
          <Segment.Label>{t("income")}</Segment.Label>
        </Segment.Item>
      </Segment.Group>
    </Segment>
  );
}
