import { View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Skeleton } from '../atoms/Skeleton';

const GROUPS = 2;
const CATS_PER_GROUP = 3;

function GroupSkeleton() {
  const { spacing, borderRadius: br } = useTheme();

  return (
    <View
      style={{
        marginTop: 12,
        marginHorizontal: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}
    >
      {/* Group header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Skeleton width="40%" height={14} />
      </View>
      {/* Category rows */}
      {Array.from({ length: CATS_PER_GROUP }).map((_, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 11,
            borderTopWidth: 1,
            borderTopColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <Skeleton width="55%" height={14} />
          <View style={{ flex: 1 }} />
          <Skeleton width={40} height={12} />
        </View>
      ))}
    </View>
  );
}

export function CategoriesListSkeleton() {
  return (
    <View>
      {Array.from({ length: GROUPS }).map((_, i) => (
        <GroupSkeleton key={i} />
      ))}
    </View>
  );
}
