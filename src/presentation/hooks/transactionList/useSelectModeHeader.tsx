import { useLayoutEffect, useRef } from "react";
import { View } from "react-native";
import { useNavigation } from "expo-router";
import { useTheme } from "../../providers/ThemeProvider";
import { Text } from "../../components";
import { formatBalance } from "../../../lib/format";

interface UseSelectModeHeaderOptions {
  isSelectMode: boolean;
  selectedCount: number;
  selectedTotal: number;
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
  onDoneSelection,
}: UseSelectModeHeaderOptions) {
  const navigation = useNavigation();
  const { colors } = useTheme();

  const onDoneRef = useRef(onDoneSelection);
  onDoneRef.current = onDoneSelection;

  useLayoutEffect(() => {
    if (!isSelectMode) return;

    navigation.setOptions({
      headerStyle: { backgroundColor: colors.pageBackground },
      title: selectedCount > 0 ? `${selectedCount} Selected` : "Select Items",
      headerTitle:
        selectedCount > 0
          ? () => (
              <View style={{ alignItems: "center" }}>
                <Text variant="body" style={{ fontWeight: "600" }}>
                  {selectedCount} Selected
                </Text>
                <Text variant="captionSm" color={colors.textMuted}>
                  {formatBalance(selectedTotal)}
                </Text>
              </View>
            )
          : undefined,
      headerLeft: undefined,
      headerRight: undefined,
      unstable_headerRightItems: () => [
        {
          type: "button" as const,
          icon: { type: "sfSymbol" as const, name: "xmark" },
          onPress: () => onDoneRef.current(),
        },
      ],
    });
  }, [isSelectMode, selectedCount, selectedTotal, colors.textMuted]);
}
