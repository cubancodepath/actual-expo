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
const SwiftSection = SwiftUI?.Section;

interface AccountHeaderMenuProps {
  onReconcile: () => void;
  hideReconciled: boolean;
  onToggleHideReconciled: () => void;
  onEditAccount: () => void;
  headerTextColor: string;
  isDark: boolean;
}

export function AccountHeaderMenu({
  onReconcile,
  hideReconciled,
  onToggleHideReconciled,
  onEditAccount,
  headerTextColor,
  isDark,
}: AccountHeaderMenuProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton
        ionIcon="search-outline"
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
            <SwiftSection>
              <SwiftButton
                label="Reconcile"
                systemImage="lock"
                onPress={onReconcile}
              />
              <SwiftButton
                label={hideReconciled ? 'Show Reconciled' : 'Hide Reconciled'}
                systemImage={hideReconciled ? 'checkmark.circle' : 'checkmark.circle.badge.xmark'}
                onPress={onToggleHideReconciled}
              />
            </SwiftSection>
            <SwiftSection>
              <SwiftButton
                label="Edit Account"
                systemImage="pencil"
                onPress={onEditAccount}
              />
            </SwiftSection>
          </SwiftMenu>
          </Host>
      ) : (
        <IconButton
          ionIcon="ellipsis-horizontal"
          size={20}
          color={headerTextColor}
          onPress={onEditAccount}
        />
      )}
    </View>
  );
}
