import { View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from './Text';

export interface TagPillProps {
  tagName: string;
  color?: string | null;
}

/** Determine if text should be white or black based on background brightness. */
function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // AERT brightness formula (same as Actual desktop)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 125 ? '#000000' : '#ffffff';
}

export function TagPill({ tagName, color }: TagPillProps) {
  const { colors, spacing, borderRadius } = useTheme();

  const hasColor = color && /^#[0-9a-fA-F]{6}$/.test(color);
  const bg = hasColor ? color : colors.buttonSecondaryBackground;
  const textColor = hasColor ? contrastText(color) : colors.textSecondary;

  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: spacing.sm,
        paddingVertical: 1,
        borderRadius: borderRadius.full,
        alignSelf: 'center',
      }}
    >
      <Text variant="captionSm" color={textColor} style={{ fontWeight: '600' }}>
        #{tagName}
      </Text>
    </View>
  );
}
