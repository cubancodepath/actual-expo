import { Fragment, type ReactNode } from "react";
import { View } from "react-native";
import { Checkbox, ListGroup, Separator, useThemeColor } from "heroui-native";
import { Check } from "lucide-react-native";
import { Money } from "@/ui/Money";

/**
 * One picker row, with the between-rows separator baked in.
 *
 * Every surface wrote the same `{i > 0 ? <Separator className="mx-4" /> : null}`
 * dance around a `ListGroup.Item`; passing the row's index here keeps that in
 * one place. `prefix`/`suffix` stay slots because they genuinely differ: a
 * check, a checkbox, an account icon badge, a balance, or nothing.
 */
export function PickerRow({
  title,
  titleClassName,
  index = 0,
  prefix,
  suffix,
  onPress,
}: {
  title: string;
  titleClassName?: string;
  /** Position within its section — anything above 0 gets a leading separator. */
  index?: number;
  prefix?: ReactNode;
  suffix?: ReactNode;
  onPress?: () => void;
}) {
  return (
    <Fragment>
      {index > 0 ? <Separator className="mx-4" /> : null}
      <ListGroup.Item onPress={onPress}>
        {prefix ? <ListGroup.ItemPrefix>{prefix}</ListGroup.ItemPrefix> : null}
        <ListGroup.ItemContent>
          <ListGroup.ItemTitle className={titleClassName}>{title}</ListGroup.ItemTitle>
        </ListGroup.ItemContent>
        {suffix ? <ListGroup.ItemSuffix>{suffix}</ListGroup.ItemSuffix> : null}
      </ListGroup.Item>
    </Fragment>
  );
}

/**
 * The fixed-width leading check column. Renders the column even when unchecked
 * so rows in a section stay aligned.
 */
export function PickerCheck({
  isSelected,
  children,
}: {
  isSelected?: boolean;
  children?: ReactNode;
}) {
  const accent = useThemeColor("accent");
  return (
    <View className="w-5 items-center justify-center">
      {children ?? (isSelected ? <Check size={18} color={accent} /> : null)}
    </View>
  );
}

/**
 * The multi-select checkbox every picker shares — round, so ticking several
 * reads as selection rather than as a form.
 *
 * The indicator's borderRadius is pinned through the check animation: heroui
 * animates it as part of the tick, which would momentarily square off a circle.
 *
 * Without `onPress` it is purely visual (`pointerEvents="none"`) and the row
 * underneath is the tap target; with it, the box is its own control — for
 * headers and other places that have no row to tap.
 */
export function PickerCheckbox({
  isSelected,
  onPress,
  className,
}: {
  isSelected: boolean;
  onPress?: () => void;
  className?: string;
}) {
  const checkbox = (
    <Checkbox
      isSelected={isSelected}
      onSelectedChange={onPress}
      className={`rounded-full ${className ?? ""}`}
    >
      <Checkbox.Indicator
        className="rounded-full"
        animation={{ borderRadius: { value: [999, 999] } }}
      />
    </Checkbox>
  );
  if (onPress) return checkbox;
  return <View pointerEvents="none">{checkbox}</View>;
}

/** The trailing balance column. */
export function PickerBalance({ cents }: { cents: number }) {
  return <Money cents={cents} className="text-sm" />;
}
