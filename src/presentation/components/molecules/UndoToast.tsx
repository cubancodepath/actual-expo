import { useEffect, useCallback } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUndoStore } from '../../../stores/undoStore';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';

const AUTO_DISMISS_MS = 5000;

export function UndoToast() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const notification = useUndoStore((s) => s.notification);
  const canUndo = useUndoStore((s) => s.canUndo);
  const undo = useUndoStore((s) => s.undo);
  const clearNotification = useUndoStore((s) => s.clearNotification);

  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);

  const dismiss = useCallback(() => {
    translateY.value = withTiming(100, { duration: 200 });
    opacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(clearNotification)();
    });
  }, [clearNotification, translateY, opacity]);

  useEffect(() => {
    if (notification) {
      // Show
      translateY.value = withTiming(0, { duration: 250 });
      opacity.value = withTiming(1, { duration: 250 });

      // Auto-dismiss
      const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
      return () => clearTimeout(timer);
    }
  }, [notification?.key]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!notification) return null;

  const handleUndo = async () => {
    dismiss();
    await undo();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: insets.bottom + 16,
          backgroundColor: theme.colors.headerBackground,
        },
        animatedStyle,
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.content}>
        <Text
          style={[styles.message, { color: theme.colors.headerText }]}
          numberOfLines={1}
        >
          {notification.message}
        </Text>
        {canUndo && (
          <Pressable onPress={handleUndo} hitSlop={8}>
            <Text style={[styles.undoButton, { color: theme.colors.primary }]}>
              Undo
            </Text>
          </Pressable>
        )}
        <Pressable onPress={dismiss} hitSlop={8}>
          <Text style={[styles.dismissButton, { color: theme.colors.headerText, opacity: 0.6 }]}>
            Dismiss
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  message: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  undoButton: {
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dismissButton: {
    fontSize: 13,
    fontWeight: '500',
  },
});
