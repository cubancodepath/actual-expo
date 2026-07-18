import { useTranslation } from "react-i18next";
import { Segment } from "heroui-native-pro";

/** Expense / income — shared by the transaction and schedule money forms. */
export type MoneyType = "expense" | "income";

type TypeSegmentProps = {
  value: MoneyType;
  onChange: (type: MoneyType) => void;
};

/** Expense / income selector built on the HeroUI Pro Segment. */
export function TypeSegment({ value, onChange }: TypeSegmentProps) {
  const { t } = useTranslation("transactions");
  return (
    <Segment value={value} onValueChange={(v) => onChange(v as MoneyType)}>
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
