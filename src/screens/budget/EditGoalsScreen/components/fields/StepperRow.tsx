import { NumberStepper } from "heroui-native-pro";
import { OptionRow } from "./OptionRow";

/** A numeric field (interval, months, weight, percent) with -/+ controls. */
export function StepperRow({
  label,
  description,
  value,
  onChange,
  minValue = 1,
  maxValue = 99,
  step = 1,
  formatValue,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  minValue?: number;
  maxValue?: number;
  step?: number;
  /** Render the value with a unit or suffix (e.g. "10%"). */
  formatValue?: (value: number) => string;
}) {
  return (
    <OptionRow label={label} description={description}>
      <NumberStepper
        value={value}
        onValueChange={onChange}
        minValue={minValue}
        maxValue={maxValue}
        step={step}
      >
        <NumberStepper.DecrementButton />
        <NumberStepper.Value>{formatValue ? formatValue(value) : undefined}</NumberStepper.Value>
        <NumberStepper.IncrementButton />
      </NumberStepper>
    </OptionRow>
  );
}
