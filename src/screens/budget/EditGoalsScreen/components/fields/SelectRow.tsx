import { ScrollView, StyleSheet } from "react-native";
import { Select } from "heroui-native";
import { OptionRow } from "./OptionRow";

const styles = StyleSheet.create({
  list: { maxHeight: 320 },
});

export type SelectChoice<T extends string> = { value: T; label: string };

/** A row that picks one of a short list of options from a popover. */
export function SelectRow<T extends string>({
  label,
  description,
  value,
  choices,
  placeholder,
  onChange,
}: {
  label: string;
  description?: string;
  value: T | undefined;
  choices: SelectChoice<T>[];
  placeholder?: string;
  onChange: (value: T) => void;
}) {
  // Select wants a {value,label} option, not our bare value.
  const selected: { value: string; label: string } | undefined = choices.find(
    (c) => c.value === value,
  );

  return (
    <OptionRow label={label} description={description}>
      <Select
        value={selected}
        onValueChange={(next) => {
          const option = Array.isArray(next) ? next[0] : next;
          if (option) onChange(option.value as T);
        }}
      >
        <Select.Trigger>
          <Select.Value placeholder={placeholder ?? ""} />
          <Select.TriggerIndicator />
        </Select.Trigger>
        <Select.Portal>
          <Select.Overlay />
          {/* Popovers have no intrinsic size — without a width the panel
              collapses to letter-wrap, and long lists overflow the screen
              unless the items scroll inside a capped height. */}
          <Select.Content presentation="popover" width={240}>
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {choices.map((choice) => (
                <Select.Item key={choice.value} value={choice.value} label={choice.label} />
              ))}
            </ScrollView>
          </Select.Content>
        </Select.Portal>
      </Select>
    </OptionRow>
  );
}
