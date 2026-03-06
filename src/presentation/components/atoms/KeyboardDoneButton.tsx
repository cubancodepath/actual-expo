import { Keyboard } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useTheme } from '../../providers/ThemeProvider';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { GlassButton } from './GlassButton';

/**
 * Floating glass/blur checkmark button that appears above the keyboard
 * and dismisses it on press. Drop-in — no props needed.
 */
export function KeyboardDoneButton() {
  const { spacing } = useTheme();
  const { height: keyboardHeight, visible } = useKeyboardHeight();

  const animatedStyle = useAnimatedStyle(() => ({
    bottom: keyboardHeight.value,
  }));

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          right: spacing.lg,
          zIndex: 10,
          marginBottom: spacing.sm,
        },
        animatedStyle,
      ]}
    >
      <GlassButton icon="checkmark" iconSize={18} onPress={() => Keyboard.dismiss()} />
    </Animated.View>
  );
}
