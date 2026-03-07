import { useLayoutEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../../components';
import { formatBalance } from '../../../lib/format';

interface UseSelectModeHeaderOptions {
  isSelectMode: boolean;
  selectedCount: number;
  selectedTotal: number;
  onSelectAll: () => void;
  onDoneSelection: () => void;
}

/**
 * Manages the navigation header when in select mode.
 * Does nothing when isSelectMode is false — screen handles its own normal header.
 */
export function useSelectModeHeader({
  isSelectMode,
  selectedCount,
  selectedTotal,
  onSelectAll,
  onDoneSelection,
}: UseSelectModeHeaderOptions) {
  const navigation = useNavigation();
  const { colors } = useTheme();

  // Refs to keep stable callback identities in the layout effect
  const onSelectAllRef = useRef(onSelectAll);
  onSelectAllRef.current = onSelectAll;
  const onDoneRef = useRef(onDoneSelection);
  onDoneRef.current = onDoneSelection;

  useLayoutEffect(() => {
    if (!isSelectMode) return;

    navigation.setOptions({
      headerStyle: { backgroundColor: colors.pageBackground },
      title: selectedCount > 0
        ? `${selectedCount} Selected`
        : 'Select Items',
      headerTitle: selectedCount > 0
        ? () => (
            <View style={{ alignItems: 'center' }}>
              <Text variant="body" style={{ fontWeight: '600' }}>{selectedCount} Selected</Text>
              <Text variant="captionSm" color={colors.textMuted}>{formatBalance(selectedTotal)}</Text>
            </View>
          )
        : undefined,
      headerRight: undefined,
      unstable_headerRightItems: () => [
        {
          type: 'button' as const,
          icon: { type: 'sfSymbol' as const, name: 'xmark' },
          onPress: () => onDoneRef.current(),
        },
      ],
      headerLeft: () => (
        <Pressable onPress={() => onSelectAllRef.current()} hitSlop={8} style={{ paddingHorizontal: 8 }}>
          <Text variant="body" color={colors.headerText} style={{ fontWeight: '600' }}>
            Select All
          </Text>
        </Pressable>
      ),
    });
  }, [isSelectMode, selectedCount, selectedTotal, colors.headerText, colors.textMuted]);
}
