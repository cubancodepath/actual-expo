import { ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../providers/ThemeProvider';
import { ListItem } from './ListItem';
import type { ReconciledBudgetFile, BudgetFileState } from '../../../services/budgetfiles';

export interface BudgetFileRowProps {
  file: ReconciledBudgetFile;
  isActive?: boolean;
  isSelecting?: boolean;
  onPress?: () => void;
}

const STATE_ICON: Record<BudgetFileState, keyof typeof Ionicons.glyphMap> = {
  synced: 'document-text',
  local: 'document',
  detached: 'document',
  remote: 'cloud-download-outline',
};

const STATE_LABEL: Record<BudgetFileState, string> = {
  synced: 'Synced',
  local: 'Local only',
  detached: 'Detached',
  remote: 'Available on server',
};

export function BudgetFileRow({ file, isActive, isSelecting, onPress }: BudgetFileRowProps) {
  const { colors } = useTheme();

  const subtitle = [
    STATE_LABEL[file.state],
    file.ownerName,
    file.encryptKeyId ? 'Encrypted' : null,
  ].filter(Boolean).join(' · ');

  const iconName = STATE_ICON[file.state];
  const iconColor = file.state === 'remote' ? colors.textMuted : colors.primary;
  const icon = <Ionicons name={iconName} size={22} color={iconColor} />;

  let right: React.ReactNode = undefined;
  if (isSelecting) {
    right = <ActivityIndicator size="small" color={colors.primary} />;
  } else if (isActive) {
    right = <Ionicons name="checkmark" size={20} color={colors.primary} />;
  }

  return (
    <ListItem
      left={icon}
      title={file.name || 'Unnamed budget'}
      subtitle={subtitle}
      right={right}
      onPress={isActive || isSelecting ? undefined : onPress}
    />
  );
}
