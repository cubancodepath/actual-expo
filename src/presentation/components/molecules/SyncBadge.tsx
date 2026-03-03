import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncStore } from '../../../stores/syncStore';
import { useTheme } from '../../providers/ThemeProvider';

export function SyncBadge() {
  const { status, sync } = useSyncStore();
  const { colors } = useTheme();
  const [showSuccess, setShowSuccess] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === 'success') {
      setShowSuccess(true);
      timer.current = setTimeout(() => setShowSuccess(false), 3000);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [status]);

  if (status === 'syncing') {
    return (
      <View style={{ paddingRight: 14 }}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <Pressable onPress={sync} hitSlop={10} style={{ paddingRight: 14 }}>
        <Ionicons name="alert-circle" size={20} color={colors.negative} />
      </Pressable>
    );
  }

  if (showSuccess) {
    return (
      <View style={{ paddingRight: 14 }}>
        <Ionicons name="checkmark-circle" size={20} color={colors.positive} />
      </View>
    );
  }

  return null;
}
