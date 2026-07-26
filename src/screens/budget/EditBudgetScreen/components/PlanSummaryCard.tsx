import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ListGroup, Separator } from "heroui-native";
import { useAmountKeyboardState } from "@/ui/amount-keyboard";
import { Money } from "@/ui/Money";
import { IncomeField, INCOME_FIELD_PADDING } from "./IncomeField";

/**
 * The read-only amount pays the income field's own horizontal padding, so both
 * figures in the card share one right edge.
 *
 * The field sets the grid rather than following it: it's the only row with
 * chrome, that chrome needs to sit inside the row's own `p-4` with room to
 * breathe, and its number therefore lands short of where a bare `ItemSuffix`
 * would put one. Matching the other row to it costs a wrapper; the reverse would
 * mean the field's box hanging into the card's padding.
 */
const AMOUNT_INSET = INCOME_FIELD_PADDING;

/**
 * The card that cuts the hero, and the half of the screen that answers a
 * question instead of stating a figure: the hero says what a month costs, this
 * says whether you can pay for it. Goes inside `EnvelopeSheet.Pinned`, so it
 * stays put while the groups scroll under it.
 *
 * Income is asked for, not derived — see `useMonthlyIncome` — through an
 * {@link IncomeField}, which shows its input chrome only while it's still empty
 * and gets out of the way once it holds an answer. The value comes from the
 * enclosing `<AmountKeyboard>` rather than from props, the same way the field
 * reads it: the screen owns that state (see `useIncomeEditor`) because the pad
 * is a screen-level overlay.
 *
 * Two rows, always: what comes in, and what's left after `costCents`. The card
 * asks one question — does what you earn cover the life you have — and a third
 * figure alongside it only ever answered a different one.
 *
 * The second row keeps a single neutral label whether the number under it is
 * positive or negative: a label that rewrote itself as the figure crossed zero
 * read as two different rows, when it's one row whose value happens to change
 * sign. Its colour, though, is a claim, and it stays silent until there are two
 * real numbers to make it with — see `verdictColor`.
 */
export function PlanSummaryCard({
  costCents,
}: {
  /** The hero's figure, and what income is measured against. */
  costCents: number;
}) {
  const { t } = useTranslation("budget");
  const { value: income } = useAmountKeyboardState();

  const remaining = income - costCents;

  // A verdict needs both of its terms. With no income entered, red would blame
  // the user for a shortfall that exists only because they haven't typed
  // anything; with no cost (a new file, no goals and no history) green would
  // congratulate them against nothing. The subtraction still shows — it's
  // correct arithmetic — but nothing colours it in.
  const canCompare = income > 0 && costCents > 0;
  const verdictColor = !canCompare
    ? "text-balanced"
    : remaining < 0
      ? "text-danger"
      : "text-positive";

  return (
    <View className="px-4">
      <ListGroup className="overflow-hidden rounded-2xl shadow-md">
        {/* No `onPress` on the row: the field is the only tap target, which is
            what makes it read as a field rather than as a row that happens to
            lead somewhere. `IncomeField` brings its own Trigger. */}
        <ListGroup.Item>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>{t("planIncomeLabel")}</ListGroup.ItemTitle>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <IncomeField />
          </ListGroup.ItemSuffix>
        </ListGroup.Item>

        <Separator className="mx-4" />
        <ListGroup.Item>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle>{t("planLeftover")}</ListGroup.ItemTitle>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix>
            <View className={AMOUNT_INSET}>
              <Money
                cents={remaining}
                tone="plain"
                className={`text-base font-semibold ${verdictColor}`}
              />
            </View>
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </ListGroup>
    </View>
  );
}
