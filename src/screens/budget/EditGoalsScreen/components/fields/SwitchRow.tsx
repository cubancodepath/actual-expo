import { Switch } from "heroui-native";
import { OptionRow } from "./OptionRow";

/** A boolean field. */
export function SwitchRow({
  label,
  description,
  isSelected,
  onChange,
}: {
  label: string;
  description?: string;
  isSelected: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <OptionRow label={label} description={description}>
      <Switch isSelected={isSelected} onSelectedChange={onChange} />
    </OptionRow>
  );
}
