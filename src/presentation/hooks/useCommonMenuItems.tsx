import { Stack, useRouter } from 'expo-router';
import { useUndoStore } from '../../stores/undoStore';
import { usePrivacyStore } from '../../stores/privacyStore';

import type { Router } from 'expo-router';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// JSX API — for Stack.Toolbar.Menu
// ---------------------------------------------------------------------------

/**
 * Returns common MenuAction elements (Undo, Privacy, Settings) as an array.
 * Spread into <Stack.Toolbar.Menu> children.
 *
 * Usage:
 *   const commonActions = useCommonMenuActions();
 *   <Stack.Toolbar.Menu icon="ellipsis">
 *     {commonActions}
 *     <Stack.Toolbar.MenuAction ...>Screen-specific</Stack.Toolbar.MenuAction>
 *   </Stack.Toolbar.Menu>
 */
export function useCommonMenuActions(): ReactNode[] {
  const router = useRouter();
  const canUndo = useUndoStore((s) => s.canUndo);
  const { privacyMode, toggle: togglePrivacy } = usePrivacyStore();

  return [
    <Stack.Toolbar.MenuAction
      key="undo"
      icon="arrow.uturn.backward"
      disabled={!canUndo}
      onPress={async () => {
        await useUndoStore.getState().undo();
      }}
    >
      Undo
    </Stack.Toolbar.MenuAction>,
    <Stack.Toolbar.MenuAction
      key="privacy"
      icon={privacyMode ? 'eye' : 'eye.slash'}
      onPress={togglePrivacy}
    >
      {privacyMode ? 'Show Amounts' : 'Hide Amounts'}
    </Stack.Toolbar.MenuAction>,
    <Stack.Toolbar.MenuAction
      key="settings"
      icon="gearshape"
      onPress={() => router.push('/(auth)/settings')}
    >
      Settings
    </Stack.Toolbar.MenuAction>,
  ];
}

// ---------------------------------------------------------------------------
// Object API — for unstable_headerRightItems
// ---------------------------------------------------------------------------

type MenuActionItem = {
  type: 'action';
  label: string;
  icon: { type: 'sfSymbol'; name: string };
  disabled?: boolean;
  onPress: () => void;
};

/**
 * Common menu action items (Undo, Privacy, Settings) as objects for
 * unstable_headerRightItems. Reads store state via getState() —
 * call inside useLayoutEffect and include canUndo + privacyMode
 * in the dependency array for reactivity.
 */
export function getCommonMenuItems(router: Router): MenuActionItem[] {
  const canUndo = useUndoStore.getState().canUndo;
  const { privacyMode } = usePrivacyStore.getState();

  return [
    {
      type: 'action' as const,
      label: 'Undo',
      icon: { type: 'sfSymbol' as const, name: 'arrow.uturn.backward' },
      disabled: !canUndo,
      onPress: async () => {
        await useUndoStore.getState().undo();
      },
    },
    {
      type: 'action' as const,
      label: privacyMode ? 'Show Amounts' : 'Hide Amounts',
      icon: { type: 'sfSymbol' as const, name: privacyMode ? 'eye' : 'eye.slash' },
      onPress: () => usePrivacyStore.getState().toggle(),
    },
    {
      type: 'action' as const,
      label: 'Settings',
      icon: { type: 'sfSymbol' as const, name: 'gearshape' },
      onPress: () => router.push('/(auth)/settings'),
    },
  ];
}
