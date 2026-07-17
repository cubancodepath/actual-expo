import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { Separator } from "heroui-native";
import { Segment } from "heroui-native-pro";
import { OptionRow } from "./OptionRow";
import { StepperRow } from "./StepperRow";

export type Adjustment = {
  adjustment?: number;
  adjustmentType?: "percent" | "fixed";
};

type Mode = "none" | "increase" | "decrease";

function modeOf({ adjustment }: Adjustment): Mode {
  if (!adjustment) return "none";
  return adjustment > 0 ? "increase" : "decrease";
}

/**
 * The optional "…but a bit more/less" modifier on schedule and average goals
 * (`[increase 20%]` in template syntax).
 *
 * Percent adjustments are capped at 1000% and can't reach -100%, matching what
 * the engine accepts — beyond that the goal would zero out or explode.
 */
export function AdjustmentField({
  value,
  onChange,
}: {
  value: Adjustment;
  onChange: (next: Adjustment) => void;
}) {
  const { t } = useTranslation("budget");

  const mode = modeOf(value);
  const type = value.adjustmentType ?? "percent";
  const magnitude = Math.abs(value.adjustment ?? 0);

  const setMode = (next: Mode) => {
    if (next === "none") {
      onChange({ adjustment: undefined, adjustmentType: undefined });
      return;
    }
    const size = magnitude || 10;
    onChange({
      adjustment: next === "increase" ? size : -size,
      adjustmentType: type,
    });
  };

  const setMagnitude = (size: number) => {
    onChange({ adjustment: mode === "decrease" ? -size : size, adjustmentType: type });
  };

  const setType = (next: "percent" | "fixed") => {
    onChange({ adjustment: value.adjustment, adjustmentType: next });
  };

  return (
    <>
      <OptionRow label={t("goals.fields.adjust")} description={t("goals.fields.adjustHint")}>
        <Segment value={mode} size="sm" onValueChange={(v) => setMode(v as Mode)}>
          <Segment.Group>
            <Segment.Indicator />
            <Segment.Item value="none">
              <Segment.Label>{t("goals.adjust.none")}</Segment.Label>
            </Segment.Item>
            <Segment.Item value="increase">
              <Segment.Label>{t("goals.adjust.increase")}</Segment.Label>
            </Segment.Item>
            <Segment.Item value="decrease">
              <Segment.Label>{t("goals.adjust.decrease")}</Segment.Label>
            </Segment.Item>
          </Segment.Group>
        </Segment>
      </OptionRow>

      {mode !== "none" ? (
        <Fragment>
          <Separator className="mx-4" />
          <OptionRow label={t("goals.fields.adjustBy")}>
            <Segment
              value={type}
              size="sm"
              onValueChange={(v) => setType(v as "percent" | "fixed")}
            >
              <Segment.Group>
                <Segment.Indicator />
                <Segment.Item value="percent">
                  <Segment.Label>{t("goals.adjust.percent")}</Segment.Label>
                </Segment.Item>
                <Segment.Item value="fixed">
                  <Segment.Label>{t("goals.adjust.fixed")}</Segment.Label>
                </Segment.Item>
              </Segment.Group>
            </Segment>
          </OptionRow>
          <Separator className="mx-4" />
          <StepperRow
            label={t("goals.fields.adjustAmount")}
            value={magnitude}
            onChange={setMagnitude}
            minValue={1}
            maxValue={type === "percent" ? 1000 : 100000}
            step={type === "percent" ? 5 : 10}
            formatValue={(v) => (type === "percent" ? `${v}%` : String(v))}
          />
        </Fragment>
      ) : null}
    </>
  );
}
