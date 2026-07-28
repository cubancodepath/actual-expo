import { Pressable, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  withSpring,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Typography, useThemeColor } from "heroui-native";
import { ArrowDown } from "lucide-react-native";
import type { TransferDirection } from "@/screens/budget/hooks/useTransferFlow";
import { lightHaptic } from "@/ui/haptics";
import { useSurfaceLevel } from "@/ui/surface-level";

const TRACK_W = 34;
const TRACK_H = 58;
const THUMB = 26;
const PAD = 4;
/** How far the thumb travels between the track's two ends. */
const TRAVEL = TRACK_H - PAD * 2 - THUMB;

const SPRING_CONFIG = { damping: 20, stiffness: 200 };

interface DirectionToggleProps {
  value: TransferDirection;
  onChange: (next: TransferDirection) => void;
}

/**
 * Vertical switch picking which way the money moves.
 *
 * `value` is relative to the hero category (mirroring the domain's transfer
 * direction): "to" = money comes into it, "from" = money leaves it. On screen
 * that category sits ABOVE the counterpart list, so money coming in travels up
 * and money leaving travels down — the thumb and its arrow ride the same way.
 * The label, in turn, names the counterparts' role: they're where the money
 * comes *From*, or where it goes *To*. So "to" pairs with a "From" label, and
 * vice versa. Tapping the track toggles it.
 *
 * Colours are derived from the theme rather than fixed: the hero behind this
 * switch takes three different tints (danger/success/balanced), so the track is
 * a foreground wash (reading as a darker shade of whichever tint is live) and
 * the thumb takes the `item` rung — untinted, so it punches a clean hole through
 * all three, in both light and dark mode.
 */
export function DirectionToggle({ value, onChange }: DirectionToggleProps) {
  const { item } = useSurfaceLevel();
  const { t } = useTranslation("budget");
  const foreground = useThemeColor("foreground");
  const reducedMotion = useReducedMotion();

  // 0 = money travels up into the category ("to"), 1 = down out of it ("from").
  // Derived rather than mirrored: `value` is the only source of truth, and the
  // spring re-runs whenever it changes.
  const progress = useDerivedValue(() => {
    const target = value === "from" ? 1 : 0;
    return reducedMotion ? target : withSpring(target, SPRING_CONFIG);
  });

  // ---- Animated styles ----
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, TRAVEL]) }],
  }));

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [180, 0])}deg` }],
  }));

  // Named for the counterparts, not the hero category — see the doc comment.
  const label = t(value === "to" ? "from" : "to");

  return (
    <View className="items-center gap-1.5">
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value === "to" }}
        accessibilityLabel={label}
        onPress={() => {
          lightHaptic();
          onChange(value === "to" ? "from" : "to");
        }}
        className="rounded-full bg-foreground/15"
        style={{ width: TRACK_W, height: TRACK_H, padding: PAD }}
      >
        <Animated.View
          className={`items-center justify-center rounded-full shadow-md ${item}`}
          style={[{ width: THUMB, height: THUMB }, thumbStyle]}
        >
          <Animated.View style={arrowStyle}>
            <ArrowDown size={14} color={foreground} />
          </Animated.View>
        </Animated.View>
      </Pressable>
      <Typography className="text-xs font-semibold text-foreground">{label}</Typography>
    </View>
  );
}
