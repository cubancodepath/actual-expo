import { View, type ViewProps } from "react-native";
import { useThemedStyles } from "../../providers/ThemeProvider";
import type { Theme } from "../../../theme";

export interface CardProps extends ViewProps {
  variant?: "default" | "elevated";
}

export function Card({ variant = "default", style, children, ...props }: CardProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.base, variant === "elevated" && styles.elevated, style]} {...props}>
      {children}
    </View>
  );
}

const createStyles = (theme: Theme) => ({
  base: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.thin,
    borderColor: theme.colors.cardBorder,
    ...theme.shadows.card,
  },
  elevated: {
    ...theme.shadows.elevated,
  },
});
