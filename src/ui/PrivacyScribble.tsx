import type { StyleProp, ViewStyle } from "react-native";
import Svg, { G, Path } from "react-native-svg";

// Hand-drawn scribble that redacts an amount in privacy mode. Stretches to fill
// its container (which is sized to the amount it replaces), so it reads as a
// strike-through at any font size. `vectorEffect="non-scaling-stroke"` keeps the
// pen width constant instead of shrinking with the (tiny) row height.
const SCRIBBLE_PATH =
  "M 22 91 C 36 58, 48 40, 54 53 C 62 70, 39 104, 58 104 C 75 104, 81 57, 95 54 " +
  "C 108 52, 98 100, 113 100 C 128 100, 132 58, 148 57 C 164 56, 150 102, 169 101 " +
  "C 188 100, 191 53, 208 57 C 223 61, 207 101, 227 100 C 248 99, 251 58, 267 61 " +
  "C 283 64, 269 100, 290 98 C 315 96, 326 72, 343 68 C 361 63, 349 96, 382 83";

type PrivacyScribbleProps = {
  /** Stroke colour — the tone the hidden amount would have had. */
  color: string;
  style?: StyleProp<ViewStyle>;
};

export function PrivacyScribble({ color, style }: PrivacyScribbleProps) {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 420 140"
      preserveAspectRatio="xMidYMid slice"
      style={style}
    >
      {/* rotate/skew for a hand-drawn feel; the centred scale(1, .6) flattens the
          waves so the scribble sits low like a strike-through and matches the
          text's line height instead of towering over it. */}
      <G transform="rotate(-4, 210, 70) skewX(-8) translate(0, 70) scale(1, 0.6) translate(0, -70)">
        <Path
          d={SCRIBBLE_PATH}
          fill="none"
          stroke={color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </G>
    </Svg>
  );
}
