import { Stack } from 'expo-router';

interface SelectModeToolbarProps {
  allCleared: boolean;
  selectedCount: number;
  onToggleCleared: () => void;
  onDelete: () => void;
  onMove: (accountId: string, accountName: string) => void;
  onSetCategory: () => void;
  moveAccounts: Array<{ id: string; name: string }>;
}

export function SelectModeToolbar({
  allCleared,
  selectedCount,
  onToggleCleared,
  onDelete,
  onMove,
  onSetCategory,
  moveAccounts,
}: SelectModeToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <Stack.Toolbar>
      <Stack.Toolbar.Button
        icon={allCleared ? 'circle' : 'checkmark.circle'}
        onPress={onToggleCleared}
        disabled={!hasSelection}
      >
        {allCleared ? 'Unclear' : 'Clear'}
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Button
        icon="tag"
        onPress={onSetCategory}
        disabled={!hasSelection}
      >
        Categorize
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Spacer />
      <Stack.Toolbar.Menu icon="ellipsis">
        {moveAccounts.length > 0 && (
          <Stack.Toolbar.Menu icon="arrow.right.arrow.left" title="Move to...">
            {moveAccounts.map(acc => (
              <Stack.Toolbar.MenuAction
                key={acc.id}
                onPress={() => onMove(acc.id, acc.name)}
              >
                {acc.name}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        )}
        <Stack.Toolbar.MenuAction
          icon="trash"
          destructive
          onPress={onDelete}
        >
          Delete
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}
