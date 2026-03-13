import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '..';

interface UnclearedBannerProps {
  count: number;
}

export function UnclearedBanner({ count }: UnclearedBannerProps) {
  const { colors, spacing } = useTheme();
  const { t } = useTranslation('accounts');

  if (count === 0) return null;

  return (
    <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="ellipse-outline" size={14} color={colors.textMuted} />
        <Text variant="bodySm" color={colors.textSecondary}>
          {t('detail.unclearedBanner', { count })}
        </Text>
      </View>
    </View>
  );
}
