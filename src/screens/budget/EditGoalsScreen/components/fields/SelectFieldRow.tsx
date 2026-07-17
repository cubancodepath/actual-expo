import { ScrollView, StyleSheet } from "react-native";
import { Select } from "heroui-native";
import type { LucideIcon } from "lucide-react-native";
import { FieldRow } from "./FieldRow";

const styles = StyleSheet.create({
  list: { maxHeight: 320 },
});

export type SelectFieldChoice<T extends string> = { value: T; label: string };

/**
 * A FieldRow whose field is a Select: the whole row is the trigger, the value
 * reads under the label with a chevron at the trailing edge.
 */
export function SelectFieldRow<T extends string>({
  icon,
  label,
  value,
  choices,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  value: T | undefined;
  choices: SelectFieldChoice<T>[];
  onChange: (value: T) => void;
}) {
  const selected: { value: string; label: string } | undefined = choices.find(
    (c) => c.value === value,
  );

  return (
    <Select
      value={selected}
      onValueChange={(next) => {
        const option = Array.isArray(next) ? next[0] : next;
        if (option) onChange(option.value as T);
      }}
    >
      <Select.Trigger variant="unstyled">
        <FieldRow>
          <FieldRow.Icon icon={icon} />
          <FieldRow.Content>
            <FieldRow.Label>{label}</FieldRow.Label>
            <FieldRow.Value>{selected?.label ?? ""}</FieldRow.Value>
          </FieldRow.Content>
          <FieldRow.Suffix />
        </FieldRow>
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        {/* Popovers have no intrinsic size — without a width the panel
            collapses to letter-wrap, and long lists (31 days) overflow the
            screen unless the items scroll inside a capped height. */}
        <Select.Content presentation="popover" width={240}>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {choices.map((choice) => (
              <Select.Item key={choice.value} value={choice.value} label={choice.label} />
            ))}
          </ScrollView>
        </Select.Content>
      </Select.Portal>
    </Select>
  );
}
