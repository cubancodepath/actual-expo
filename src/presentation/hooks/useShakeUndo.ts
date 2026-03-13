import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { Accelerometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';
import i18n from '../../i18n/config';
import { useUndoStore } from '../../stores/undoStore';

const SHAKE_THRESHOLD = 2.5; // magnitude threshold (gravity ≈ 1.0, so net > 1.5g)
const SHAKE_COUNT = 3; // required threshold crossings
const SHAKE_WINDOW_MS = 600; // window for crossings
const DEBOUNCE_MS = 2000; // ignore shakes after alert shown

/**
 * Listens for device shake gestures and shows a native iOS undo alert.
 * Follows Apple HIG: "Undo {action}?" with Cancel/Undo buttons.
 * Pauses when app is backgrounded to save battery.
 */
export function useShakeUndo() {
  const timestamps = useRef<number[]>([]);
  const lastAlertAt = useRef(0);

  useEffect(() => {
    Accelerometer.setUpdateInterval(100); // 10Hz

    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (magnitude < SHAKE_THRESHOLD) return;

      const now = Date.now();

      // Debounce after alert
      if (now - lastAlertAt.current < DEBOUNCE_MS) return;

      // Track threshold crossings within window
      timestamps.current.push(now);
      timestamps.current = timestamps.current.filter(t => now - t < SHAKE_WINDOW_MS);

      if (timestamps.current.length >= SHAKE_COUNT) {
        timestamps.current = [];
        handleShake();
      }
    });

    // Pause accelerometer when backgrounded
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        Accelerometer.setUpdateInterval(100);
      }
    });

    return () => {
      subscription.remove();
      appStateSubscription.remove();
    };
  }, []);

  function handleShake() {
    const { canUndo, lastAction, undo } = useUndoStore.getState();
    if (!canUndo || !lastAction) return;

    lastAlertAt.current = Date.now();

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

    Alert.alert(
      i18n.t('common:undoAction', { action: lastAction }),
      undefined,
      [
        { text: i18n.t('common:cancel'), style: 'cancel' },
        { text: i18n.t('common:undo'), style: 'destructive', onPress: () => undo() },
      ],
    );
  }
}
