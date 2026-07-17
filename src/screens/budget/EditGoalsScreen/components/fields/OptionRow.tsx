import type { ReactNode } from "react";
import { View } from "react-native";
import { ListGroup, Typography, useThemeColor } from "heroui-native";
import { ChevronRight } from "lucide-react-native";

/**
 * A labelled row in an editor's options list. Pass `children` for an inline
 * control (switch, stepper, select), or `value` + `onPress` for a row that
 * opens a picker.
 */
export function OptionRow({
  label,
  description,
  value,
  onPress,
  children,
}: {
  label: string;
  description?: string;
  value?: string;
  onPress?: () => void;
  children?: ReactNode;
}) {
  const muted = useThemeColor("muted");

  return (
    <ListGroup.Item onPress={onPress}>
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{label}</ListGroup.ItemTitle>
        {description ? <Typography className="text-sm text-muted">{description}</Typography> : null}
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        {children ?? (
          <View className="flex-row items-center gap-1">
            <Typography className="text-muted">{value}</Typography>
            {onPress ? <ChevronRight size={18} color={muted} /> : null}
          </View>
        )}
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}
