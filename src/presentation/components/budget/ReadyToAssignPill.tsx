import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { Amount } from '../atoms/Amount';
import { InfoPill } from '../atoms/InfoPill';
import { withOpacity } from '../../../lib/colors';
import { formatPrivacyAware } from '../../../lib/format';

interface ReadyToAssignPillProps {
  /** Budget balance in cents. Positive = money available, negative = overassigned. */
  amount: number;
  /** When provided, the pill becomes tappable. */
  onPress?: () => void;
  /** Held/buffered amount in cents. When > 0, shows compound pill with hold row. */
  holdAmount?: number;
  /** Opens HoldModal to edit the held amount. */
  onEditHold?: () => void;
  /** Resets the hold (caller should show confirmation first). */
  onClearHold?: () => void;
}

export function ReadyToAssignPill({
  amount,
  onPress,
  holdAmount = 0,
  onEditHold,
  onClearHold,
}: ReadyToAssignPillProps) {
  const { t } = useTranslation('budget');
  const { colors, spacing, borderRadius: br } = useTheme();

  const isZero = amount === 0;
  const isPositive = amount > 0;
  const isNegative = amount < 0;
  const hasHold = holdAmount > 0;

  const textColor = isPositive
    ? colors.budgetHealthy
    : isNegative
      ? colors.budgetOverspent
      : colors.textMuted;

  const backgroundColor = isPositive
    ? colors.budgetHealthyBg
    : isNegative
      ? colors.budgetOverspentBg
      : colors.cardBackground;

  const icon: keyof typeof Ionicons.glyphMap = isPositive
    ? 'wallet-outline'
    : isNegative
      ? 'alert-circle-outline'
      : 'checkmark-circle-outline';

  const label = isPositive
    ? t('readyToAssign')
    : isNegative
      ? t('overassigned')
      : t('fullyAssigned');

  // ── Simple pill (no hold) ──
  if (!hasHold) {
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

  // ── Compound pill (with hold row) ──
  return (
    <View
      style={{
        marginHorizontal: spacing.lg,
        borderRadius: br.xl,
        backgroundColor,
        overflow: 'hidden',
      }}
      accessibilityLabel={`${formatPrivacyAware(amount)} ${label}. ${t('holding')}${formatPrivacyAware(holdAmount)}${t('nextMonth')}.`}
    >
      {/* Top row: Ready to Assign / Overassigned / Fully Assigned */}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingVertical: 11,
          minHeight: 44,
          opacity: pressed && onPress ? 0.72 : 1,
        })}
        disabled={!onPress}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Ionicons name={icon} size={15} color={textColor} />
          {!isZero && (
            <Amount value={amount} variant="bodySm" color={textColor} weight="700" />
          )}
          {isZero && (
            <Text variant="bodySm" color={textColor} style={{ fontWeight: '700' }}>
              {label}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {!isZero && (
            <Text variant="captionSm" color={textColor} style={{ fontWeight: '500' }}>
              {label}
            </Text>
          )}
          {onPress && (
            <Ionicons
              name="chevron-forward"
              size={12}
              color={textColor}
              style={{ opacity: 0.45 }}
            />
          )}
        </View>
      </Pressable>

      {/* Divider */}
      <View
        style={{
          height: 1,
          marginHorizontal: spacing.lg,
          backgroundColor: withOpacity(textColor, 0.12),
        }}
      />

      {/* Hold row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingVertical: 10,
          minHeight: 40,
        }}
      >
        {/* Hold info */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
          <Ionicons
            name="play-skip-forward-outline"
            size={13}
            color={textColor}
            style={{ opacity: 0.5, marginRight: spacing.xxs }}
          />
          <Text variant="captionSm" color={textColor} style={{ opacity: 0.7 }}>
            {t('holding')}
          </Text>
          <Amount value={holdAmount} variant="captionSm" color={textColor} weight="700" />
          <Text variant="captionSm" color={textColor} style={{ opacity: 0.7 }}>
            {t('nextMonth')}
          </Text>
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Pressable onPress={onEditHold} hitSlop={8}>
            <Text variant="captionSm" color={textColor} style={{ fontWeight: '600' }}>
              {t('editAction')}
            </Text>
          </Pressable>
          <Text variant="captionSm" color={textColor} style={{ opacity: 0.3 }}>
            ·
          </Text>
          <Pressable onPress={onClearHold} hitSlop={8}>
            <Text variant="captionSm" color={textColor} style={{ fontWeight: '600', opacity: 0.7 }}>
              {t('clearAction')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
