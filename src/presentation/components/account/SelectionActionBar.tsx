import { Platform, View, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { GlassButton } from '../atoms/GlassButton';
import type { Account } from '../../../accounts/types';

// SwiftUI imports (iOS only)
const SwiftModifiers = Platform.OS === 'ios'
  ? require('@expo/ui/swift-ui/modifiers')
  : null;
const SwiftUI = Platform.OS === 'ios'
  ? require('@expo/ui/swift-ui')
  : null;
const Host = SwiftUI?.Host;
const SwiftMenu = SwiftUI?.Menu;
const SwiftButton = SwiftUI?.Button;
const SwiftSection = SwiftUI?.Section;

interface SelectionActionBarProps {
  count: number;
  allCleared: boolean;
  onMarkCleared: () => void;
  onDelete: () => void;
  onMove: (accountId: string) => void;
  accounts: Account[];
  currentAccountId: string;
  isDark: boolean;
}

const iconPillStyle: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  padding: 12,
};

export function SelectionActionBar({
  count,
  allCleared,
  onMarkCleared,
  onDelete,
  onMove,
  accounts,
  currentAccountId,
  isDark,
}: SelectionActionBarProps) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();

  const otherAccounts = accounts.filter(a => a.id !== currentAccountId && !a.closed);

  return (
    <View style={[containerStyle, { bottom: Math.max(bottom, 16) }]}>
      <Text variant="caption" style={{ fontWeight: '600' }}>
        {count} selected
      </Text>

      <View style={pillsRow}>
        {/* Left group */}
        <View style={leftGroup}>
          <GlassButton
            onPress={onMarkCleared}
            icon={allCleared ? 'circle' : 'checkmark.circle'}
            iconSize={18}
            label={allCleared ? 'Unclear' : 'Clear'}
            color={allCleared ? colors.textMuted : colors.positive}
          />
        </View>

        {/* Right: context menu pill */}
        {Platform.OS === 'ios' && Host && SwiftMenu ? (
          <View style={{ borderRadius: 50, overflow: 'hidden' }}>
            {isLiquidGlassAvailable() ? (
              <GlassView isInteractive style={{ borderRadius: 50, ...iconPillStyle }}>
                <Host
                  style={{ width: 24, height: 24 }}
                  colorScheme={isDark ? 'dark' : 'light'}
                >
                  <SwiftMenu
                    label=""
                    systemImage="ellipsis"
                    modifiers={[
                      SwiftModifiers?.labelStyle('iconOnly'),
                      SwiftModifiers?.foregroundStyle(colors.textPrimary),
                      SwiftModifiers?.frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'center' }),
                      SwiftModifiers?.environment('colorScheme', isDark ? 'dark' : 'light'),
                    ].filter(Boolean)}
                  >
                    {otherAccounts.length > 0 && (
                      <SwiftMenu label="Move to..." systemImage="arrow.right.arrow.left">
                        {otherAccounts.map(acc => (
                          <SwiftButton
                            key={acc.id}
                            label={acc.name}
                            onPress={() => onMove(acc.id)}
                          />
                        ))}
                      </SwiftMenu>
                    )}
                    <SwiftSection>
                      <SwiftButton
                        label="Delete"
                        systemImage="trash"
                        role="destructive"
                        onPress={onDelete}
                      />
                    </SwiftSection>
                  </SwiftMenu>
                </Host>
              </GlassView>
            ) : (
              <BlurView tint="systemChromeMaterial" intensity={100} style={iconPillStyle}>
                <Host
                  style={{ width: 24, height: 24 }}
                  colorScheme={isDark ? 'dark' : 'light'}
                >
                  <SwiftMenu
                    label=""
                    systemImage="ellipsis"
                    modifiers={[
                      SwiftModifiers?.labelStyle('iconOnly'),
                      SwiftModifiers?.foregroundStyle(colors.textPrimary),
                      SwiftModifiers?.frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'center' }),
                      SwiftModifiers?.environment('colorScheme', isDark ? 'dark' : 'light'),
                    ].filter(Boolean)}
                  >
                    {otherAccounts.length > 0 && (
                      <SwiftMenu label="Move to..." systemImage="arrow.right.arrow.left">
                        {otherAccounts.map(acc => (
                          <SwiftButton
                            key={acc.id}
                            label={acc.name}
                            onPress={() => onMove(acc.id)}
                          />
                        ))}
                      </SwiftMenu>
                    )}
                    <SwiftSection>
                      <SwiftButton
                        label="Delete"
                        systemImage="trash"
                        role="destructive"
                        onPress={onDelete}
                      />
                    </SwiftSection>
                  </SwiftMenu>
                </Host>
              </BlurView>
            )}
          </View>
        ) : (
          <GlassButton icon="ellipsis" onPress={onDelete} />
        )}
      </View>
    </View>
  );
}

const containerStyle: ViewStyle = {
  position: 'absolute',
  left: 0,
  right: 0,
  alignItems: 'center',
  gap: 8,
};

const pillsRow: ViewStyle = {
  flexDirection: 'row',
  justifyContent: 'space-between',
  width: '100%',
  paddingHorizontal: 16,
};

const leftGroup: ViewStyle = {
  flexDirection: 'row',
  gap: 10,
};
