import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import { InfoPill } from '../atoms/InfoPill';
import { formatPrivacyAware } from '../../../lib/format';

interface ReadyToAssignPillProps {
  /** Budget balance in cents. Positive = money available, negative = overassigned. */
  amount: number;
  /** When provided, the pill becomes tappable. */
  onPress?: () => void;
}

export function ReadyToAssignPill({ amount, onPress }: ReadyToAssignPillProps) {
  const { colors, spacing } = useTheme();

  const isPositive = amount > 0;
  const textColor = isPositive ? colors.budgetHealthy : colors.budgetOverspent;
  const backgroundColor = isPositive ? colors.budgetHealthyBg : colors.budgetOverspentBg;
  const icon: keyof typeof Ionicons.glyphMap = isPositive
    ? 'wallet-outline'
    : 'alert-circle-outline';
  const label = isPositive ? 'Ready to Assign' : 'Overassigned';

  return (
    <InfoPill
      backgroundColor={backgroundColor}
      onPress={onPress}
      accessibilityLabel={`${formatPrivacyAware(amount)} ${label}. Tap to assign budget.`}
      left={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Ionicons name={icon} size={15} color={textColor} />
          <Amount value={amount} variant="bodySm" color={textColor} weight="700" />
        </View>
      }
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text variant="captionSm" color={textColor} style={{ fontWeight: '500' }}>
            {label}
          </Text>
          {onPress && (
            <Ionicons
              name="chevron-forward"
              size={12}
              color={textColor}
              style={{ opacity: 0.45 }}
            />
          )}
        </View>
      }
    />
  );
}
