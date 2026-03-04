import { Platform, View } from 'react-native';
import { IconButton } from '..';

// SwiftUI modifiers (iOS only)
const SwiftModifiers = Platform.OS === 'ios'
  ? require('@expo/ui/swift-ui/modifiers')
  : null;

// SwiftUI imports (iOS only)
const SwiftUI = Platform.OS === 'ios'
  ? require('@expo/ui/swift-ui')
  : null;
const Host = SwiftUI?.Host;
const SwiftMenu = SwiftUI?.Menu;
const SwiftButton = SwiftUI?.Button;

interface SpendingHeaderMenuProps {
  hideReconciled: boolean;
  onToggleHideReconciled: () => void;
  headerTextColor: string;
  isDark: boolean;
}

export function SpendingHeaderMenu({
  hideReconciled,
  onToggleHideReconciled,
  headerTextColor,
  isDark,
}: SpendingHeaderMenuProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        icon="search-outline"
        size={20}
        color={headerTextColor}
        onPress={() => {}}
        disabled
      />
      {Platform.OS === 'ios' && Host && SwiftMenu ? (
        <Host
          style={{ width: 44, height: 44 }}
          colorScheme={isDark ? 'dark' : 'light'}
        >
          <SwiftMenu
            label=""
            systemImage="ellipsis"
            modifiers={[
              SwiftModifiers?.labelStyle('iconOnly'),
              SwiftModifiers?.frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'center' }),
              SwiftModifiers?.environment('colorScheme', isDark ? 'dark' : 'light'),
            ].filter(Boolean)}
          >
            <SwiftButton
              label={hideReconciled ? 'Show Reconciled' : 'Hide Reconciled'}
              systemImage={hideReconciled ? 'checkmark.circle' : 'checkmark.circle.badge.xmark'}
              onPress={onToggleHideReconciled}
            />
          </SwiftMenu>
        </Host>
      ) : (
        <IconButton
          icon="ellipsis-horizontal"
          size={20}
          color={headerTextColor}
          onPress={onToggleHideReconciled}
        />
      )}
    </View>
  );
}
