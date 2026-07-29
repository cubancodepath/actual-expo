import type { ReactNode } from "react";
import { View } from "react-native";
import { ListGroup, Typography } from "heroui-native";

/**
 * A titled block of picker rows: the uppercase muted heading plus the
 * `ListGroup` that holds the rows.
 *
 * The heading markup was duplicated character-for-character across every picker
 * surface; this is the one copy. What the title *means* stays the caller's
 * business — an initial letter for payees, a category group, on/off-budget for
 * accounts.
 */
export function PickerSection({
  title,
  className,
  children,
}: {
  /** Omit for an untitled block — e.g. flat search results. */
  title?: string;
  /** Extra classes for the inner `ListGroup`. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <View className="mb-3">
      {title ? (
        <Typography className="mb-1 ml-2 text-xs font-semibold uppercase text-muted">
          {title}
        </Typography>
      ) : null}
      <ListGroup className={className}>{children}</ListGroup>
    </View>
  );
}
