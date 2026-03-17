import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { EaseView } from "react-native-ease";
import { useTheme } from "../../providers/ThemeProvider";

type WizardProgressBarProps = {
  step: number;
  total: number;
};

export function WizardProgressBar({ step, total }: WizardProgressBarProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const pct = step / total;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: step }}
      accessibilityLabel={`Step ${step} of ${total}`}
      style={{
        height: 3,
        backgroundColor: theme.colors.inputBorder,
        marginHorizontal: theme.spacing.xl,
      }}
    >
      {reducedMotion ? (
        <View
          style={{
            height: "100%",
            width: `${pct * 100}%`,
            backgroundColor: theme.colors.primary,
            borderRadius: 1.5,
          }}
        />
      ) : (
        <EaseView
          animate={{ scaleX: pct }}
          transition={{ type: "spring", damping: 28, stiffness: 200, mass: 1 }}
          style={{
            height: "100%",
            width: "100%",
            backgroundColor: theme.colors.primary,
            borderRadius: 1.5,
          }}
          transformOrigin={{ x: 0, y: 0.5 }}
        />
      )}
    </View>
  );
}
