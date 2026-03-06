import { Keyboard, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../providers/ThemeProvider';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';

/**
 * Floating glass/blur checkmark button that appears above the keyboard
 * and dismisses it on press. Drop-in — no props needed.
 */
export function KeyboardDoneButton() {
  const { colors, spacing, borderRadius: br } = useTheme();
  const { height: keyboardHeight, visible } = useKeyboardHeight();

  const animatedStyle = useAnimatedStyle(() => ({
    bottom: keyboardHeight.value,
  }));

  if (!visible) return null;

  const pillStyle = {
    borderRadius: br.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  };

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
      <Pressable onPress={() => Keyboard.dismiss()}>
        {isLiquidGlassAvailable() ? (
          <GlassView isInteractive style={pillStyle}>
            <Ionicons name="checkmark" size={18} color={colors.textPrimary} />
          </GlassView>
        ) : (
          <BlurView
            tint="systemChromeMaterial"
            intensity={100}
            style={{ ...pillStyle, overflow: 'hidden' }}
          >
            <Ionicons name="checkmark" size={18} color={colors.textPrimary} />
          </BlurView>
        )}
      </Pressable>
    </Animated.View>
  );
}
