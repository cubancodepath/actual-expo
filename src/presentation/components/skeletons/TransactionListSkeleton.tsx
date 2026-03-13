import { View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Skeleton } from '../atoms/Skeleton';

const ROWS = 5;

function TransactionRowSkeleton() {
  const { spacing, borderRadius: br } = useTheme();

  return (
    <View
      style={{
        paddingVertical: spacing.md,
        paddingLeft: spacing.lg,
        paddingRight: spacing.md,
        gap: spacing.xs,
      }}
    >
      {/* Top row: payee + amount */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Skeleton width="45%" height={14} />
        <View style={{ flex: 1 }} />
        <Skeleton width={60} height={14} />
        <Skeleton width={14} height={14} borderRadius={7} style={{ marginLeft: spacing.sm }} />
      </View>
      {/* Meta row: category pill + account */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Skeleton width={60} height={18} borderRadius={br.full} />
        <View style={{ flex: 1 }} />
        <Skeleton width={80} height={12} />
      </View>
    </View>
  );
}

export function TransactionListSkeleton() {
  const { spacing } = useTheme();

  return (
    <View>
      {/* Date header */}
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm }}>
        <Skeleton width="30%" height={12} />
      </View>
      {Array.from({ length: ROWS }).map((_, i) => (
        <TransactionRowSkeleton key={i} />
      ))}
    </View>
  );
}
