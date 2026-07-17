import { NumberStepper } from "heroui-native-pro";
import type { LucideIcon } from "lucide-react-native";
import { FieldRow } from "./FieldRow";

/** A FieldRow whose field is a number with -/+ controls at the trailing edge. */
export function StepperFieldRow({
  icon,
  label,
  value,
  onChange,
  minValue = 1,
  maxValue = 99,
  step = 1,
  formatValue,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  onChange: (value: number) => void;
  minValue?: number;
  maxValue?: number;
  step?: number;
  /** Render the value with a unit or suffix (e.g. "10%"). */
  formatValue?: (value: number) => string;
}) {
  return (
    <FieldRow>
      <FieldRow.Icon icon={icon} />
      <FieldRow.Title>{label}</FieldRow.Title>
      <FieldRow.Suffix>
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
      </FieldRow.Suffix>
    </FieldRow>
  );
}
