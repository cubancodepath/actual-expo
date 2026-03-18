import { lightColors, darkColors, type ThemeColors } from "./colors";
import { spacing, type Spacing } from "./spacing";
import { typography, type Typography, type TypographyVariant } from "./typography";
import { borderRadius, borderWidth, type BorderRadius, type BorderWidth } from "./borders";
import { createShadows, type Shadows } from "./shadows";
import { sizes, type Sizes } from "./sizes";

export interface Theme {
  colors: ThemeColors;
  spacing: Spacing;
  typography: Typography;
  borderRadius: BorderRadius;
  borderWidth: BorderWidth;
  shadows: Shadows;
  sizes: Sizes;
  isDark: boolean;
}

export const lightTheme: Theme = {
  colors: lightColors,
  spacing,
  typography,
  borderRadius,
  borderWidth,
  shadows: createShadows(lightColors),
  sizes,
  isDark: false,
};

export const darkTheme: Theme = {
  colors: darkColors,
  spacing,
  typography,
  borderRadius,
  borderWidth,
  shadows: createShadows(darkColors),
  sizes,
  isDark: true,
};

export { palette } from "./colors";
export { spacing } from "./spacing";
export { typography } from "./typography";
export { borderRadius, borderWidth } from "./borders";
export { sizes } from "./sizes";
export type {
  ThemeColors,
  Spacing,
  Typography,
  TypographyVariant,
  BorderRadius,
  BorderWidth,
  Shadows,
  Sizes,
};
