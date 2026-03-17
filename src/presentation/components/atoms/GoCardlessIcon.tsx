import Svg, { Circle, Path } from "react-native-svg";
import { useTheme } from "../../providers/ThemeProvider";

type GoCardlessIconProps = {
  size?: number;
};

// Official GoCardless symbol — path data from brand kit SVG
// viewBox="0 0 1000 1000"
const G_PATH =
  "M507.92,242.11c55.15,0,86.19,9.05,86.19,9.05l91.66,187.18-.81.81-118-70.36c-68.36-40.72-118.04-62.12-158.35-60.49-42.71.81-68.32,35.16-68.32,85.01,1.54,127.54,122.7,284.45,243.06,284.45,49.13,0,74.7-15.79,89.67-34.93l-178.22-195.55v-.81h244.77c3.34,17.51,5.16,35.29,5.43,53.12,0,143.06-109.49,258.3-244.59,258.3s-245.41-115.24-245.41-258.3c-.23-142.25,109.27-257.49,252.92-257.49Z";

// Brand colors
const LIME = "#F1F252";
const DARK = "#1C1B18";

export function GoCardlessIcon({ size = 24 }: GoCardlessIconProps) {
  const { isDark } = useTheme();

  const circleFill = isDark ? DARK : LIME;
  const gFill = isDark ? LIME : DARK;

  return (
    <Svg width={size} height={size} viewBox="0 0 1000 1000">
      <Circle cx={500} cy={500} r={500} fill={circleFill} />
      <Path d={G_PATH} fill={gFill} />
    </Svg>
  );
}
