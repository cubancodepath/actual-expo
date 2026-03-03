import {
  lightColors,
  darkColors,
  type ThemeColors,
} from "./colors";
import { spacing, type Spacing } from "./spacing";
import { typography, type Typography, type TypographyVariant } from "./typography";
import { borderRadius, borderWidth, type BorderRadius, type BorderWidth } from "./borders";
import { createShadows, type Shadows } from "./shadows";

export interface Theme {
  colors: ThemeColors;
  spacing: Spacing;
  typography: Typography;
  borderRadius: BorderRadius;
  borderWidth: BorderWidth;
  shadows: Shadows;
  isDark: boolean;
}

export const lightTheme: Theme = {
  colors: lightColors,
  spacing,
  typography,
  borderRadius,
  borderWidth,
  shadows: createShadows(lightColors),
  isDark: false,
};

export const darkTheme: Theme = {
  colors: darkColors,
  spacing,
  typography,
  borderRadius,
  borderWidth,
  shadows: createShadows(darkColors),
  isDark: true,
};

export { palette } from "./colors";
export { spacing } from "./spacing";
export { typography } from "./typography";
export { borderRadius, borderWidth } from "./borders";
export type { ThemeColors, Spacing, Typography, TypographyVariant, BorderRadius, BorderWidth, Shadows };
