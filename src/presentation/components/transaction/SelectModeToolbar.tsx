import { Stack } from 'expo-router';

interface SelectModeToolbarProps {
  allCleared: boolean;
  selectedCount: number;
  onToggleCleared: () => void;
  onDelete: () => void;
  onMove: () => void;
  onSetCategory: () => void;
}

export function SelectModeToolbar({
  allCleared,
  selectedCount,
  onToggleCleared,
  onDelete,
  onMove,
  onSetCategory,
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
        icon="folder"
        onPress={onSetCategory}
        disabled={!hasSelection}
      >
        Categorize
      </Stack.Toolbar.Button>
      <Stack.Toolbar.Spacer />
      <Stack.Toolbar.Menu icon="ellipsis">
        <Stack.Toolbar.MenuAction
          icon="arrow.right.arrow.left"
          onPress={onMove}
          disabled={!hasSelection}
        >
          Move to…
        </Stack.Toolbar.MenuAction>
        <Stack.Toolbar.MenuAction
          icon="trash"
          destructive
          onPress={onDelete}
          disabled={!hasSelection}
        >
          Delete
        </Stack.Toolbar.MenuAction>
      </Stack.Toolbar.Menu>
    </Stack.Toolbar>
  );
}
