import { Keyboard, View } from "react-native";
import { PressableFeedback, Typography, useThemeColor } from "heroui-native";
import { ChevronRight, X, type LucideIcon } from "lucide-react-native";

type FieldRowProps = {
  icon: LucideIcon;
  label: string;
  value?: string;
  placeholder?: string;
  onPress?: () => void;
  onClear?: () => void;
  disabled?: boolean;
};

/** A tappable field row (icon · label · value · chevron) that opens a picker. */
export function FieldRow({
  icon: Icon,
  label,
  value,
  placeholder,
  onPress,
  onClear,
  disabled,
}: FieldRowProps) {
  const muted = useThemeColor("muted");
  const hasValue = !!value;

  return (
    <PressableFeedback
      isDisabled={disabled}
      onPress={() => {
        // Any picker interaction drops the keyboard from Amount/Notes first so
        // it never lingers behind a sheet or a pushed picker screen.
        Keyboard.dismiss();
        onPress?.();
      }}
      className="flex-row items-center gap-3 px-4 py-3.5"
    >
      <Icon size={18} color={muted} />
      <Typography className="text-base text-muted">{label}</Typography>
      <View className="flex-1" />
      <Typography
        numberOfLines={1}
        className={hasValue ? "text-base text-foreground" : "text-base text-muted"}
        style={{ maxWidth: 190 }}
      >
        {hasValue ? value : placeholder}
      </Typography>
      {onClear && hasValue ? (
        <PressableFeedback onPress={onClear} hitSlop={8}>
          <X size={16} color={muted} />
        </PressableFeedback>
      ) : (
        <ChevronRight size={16} color={muted} />
      )}
    </PressableFeedback>
  );
}
