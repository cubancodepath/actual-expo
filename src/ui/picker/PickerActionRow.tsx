import type { ReactNode } from "react";
import { ListGroup, Typography } from "heroui-native";
import { PickerRow } from "./PickerRow";

/**
 * The standalone accent row that leads a picker list — "Create X", "Split
 * transaction", "No category", "Ready to assign". Same `ListGroup` + single
 * item shape everywhere; only the icon, the emphasis and the trailing check
 * differ.
 */
export function PickerActionRow({
  title,
  prefix,
  suffix,
  accent = true,
  onPress,
}: {
  title: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Accent-coloured title (the default for an action); false for a neutral row. */
  accent?: boolean;
  onPress?: () => void;
}) {
  return (
    <ListGroup className="mb-3">
      <PickerRow
        title={title}
        titleClassName={accent ? "text-accent" : undefined}
        prefix={prefix}
        suffix={suffix}
        onPress={onPress}
      />
    </ListGroup>
  );
}

/** Centred muted message for an empty or no-results list. */
export function PickerEmptyState({ message }: { message: string }) {
  return <Typography className="py-6 text-center text-base text-muted">{message}</Typography>;
}
