import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../providers/ThemeProvider';
import { palette } from '../../../theme/colors';
import { Text } from '../atoms/Text';
import { InfoPill } from '../atoms/InfoPill';

interface OverspentPillProps {
  /** Number of overspent categories. */
  count: number;
  /** Called when the pill is tapped. */
  onPress: () => void;
}

export function OverspentPill({ count, onPress }: OverspentPillProps) {
  const { t } = useTranslation('budget');
  const { colors, spacing, borderRadius: br } = useTheme();

  const label = t('overspent', { count });

  return (
    <InfoPill
      backgroundColor={colors.negativeSubtle}
      onPress={onPress}
      accessibilityLabel={`${label}. Tap to cover.`}
      style={{ paddingHorizontal: spacing.md, paddingVertical: 8 }}
      left={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View
            style={{
              backgroundColor: colors.negativeFill,
              borderRadius: 100,
              minWidth: 18,
              height: 18,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 4,
            }}
          >
            <Text
              variant="captionSm"
              color={palette.white}
              style={{ fontWeight: '700', fontSize: 10, lineHeight: 14 }}
            >
              {count}
            </Text>
          </View>
          <Text variant="captionSm" color={colors.negative} style={{ fontWeight: '500' }}>
            {label}
          </Text>
        </View>
      }
      right={
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: br.full,
            paddingHorizontal: 14,
            paddingVertical: 5,
          }}
        >
          <Text variant="captionSm" color={colors.primaryText} style={{ fontWeight: '600' }}>
            {t('coverAction')}
          </Text>
        </View>
      }
    />
  );
}
