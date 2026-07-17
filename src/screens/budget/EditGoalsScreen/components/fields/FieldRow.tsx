import { createContext, use, type ReactNode } from "react";
import { View } from "react-native";
import { cn, PressableFeedback, Typography, useThemeColor } from "heroui-native";
import { ChevronDown, type LucideIcon } from "lucide-react-native";

/**
 * A form row in the goal editor's card, composed by the consumer:
 *
 * ```tsx
 * <FieldRow onPress={openPicker}>
 *   <FieldRow.Icon icon={CalendarDays} />
 *   <FieldRow.Content>
 *     <FieldRow.Label>Due on</FieldRow.Label>
 *     <FieldRow.Value>July 2027</FieldRow.Value>
 *   </FieldRow.Content>
 *   <FieldRow.Suffix />
 * </FieldRow>
 * ```
 *
 * A row whose label IS its value — a plain switch, where the control says the
 * rest — uses `Title` in place of Content:
 *
 * ```tsx
 * <FieldRow isMuted={!repeats}>
 *   <FieldRow.Icon icon={Repeat2} />
 *   <FieldRow.Title>Repeat</FieldRow.Title>
 *   <FieldRow.Suffix><Switch … /></FieldRow.Suffix>
 * </FieldRow>
 * ```
 *
 * Rows that open something either take `onPress` or sit inside an external
 * trigger (Select, DatePicker, AmountKeyboard) and leave the root inert.
 */

const FieldRowContext = createContext<{ isMuted: boolean }>({ isMuted: false });

function FieldRowRoot({
  onPress,
  isMuted = false,
  children,
}: {
  onPress?: () => void;
  /** Read the row as inactive — its icon and Title grey out. */
  isMuted?: boolean;
  children: ReactNode;
}) {
  const body = <View className="flex-row items-center gap-3 px-4 py-3">{children}</View>;
  return (
    <FieldRowContext value={{ isMuted }}>
      {onPress ? <PressableFeedback onPress={onPress}>{body}</PressableFeedback> : body}
    </FieldRowContext>
  );
}

/** Leading icon: accent, or muted along with the row. */
function FieldRowIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { isMuted } = use(FieldRowContext);
  const accent = useThemeColor("accent");
  const muted = useThemeColor("muted");
  return <Icon size={18} color={isMuted ? muted : accent} />;
}

/** The label-over-value column. */
function FieldRowContent({ children }: { children: ReactNode }) {
  return <View className="flex-1 gap-0.5">{children}</View>;
}

function FieldRowLabel({ children }: { children: ReactNode }) {
  return <Typography className="text-xs font-medium text-muted">{children}</Typography>;
}

function FieldRowValue({ children }: { children: ReactNode }) {
  return <Typography className="text-base text-foreground">{children}</Typography>;
}

/** The whole field, when the label is the value. */
function FieldRowTitle({ children }: { children: ReactNode }) {
  const { isMuted } = use(FieldRowContext);
  return (
    <Typography className={cn("flex-1 text-base", isMuted ? "text-muted" : "text-foreground")}>
      {children}
    </Typography>
  );
}

/**
 * Trailing slot. Renders a chevron by default — pass children to put a
 * control (a switch) or a different chevron there instead.
 */
function FieldRowSuffix({ children }: { children?: ReactNode }) {
  const muted = useThemeColor("muted");
  return <>{children ?? <ChevronDown size={16} color={muted} />}</>;
}

export const FieldRow = Object.assign(FieldRowRoot, {
  Icon: FieldRowIcon,
  Content: FieldRowContent,
  Label: FieldRowLabel,
  Value: FieldRowValue,
  Title: FieldRowTitle,
  Suffix: FieldRowSuffix,
});
