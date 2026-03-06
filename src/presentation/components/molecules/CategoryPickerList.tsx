import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { Text } from '../atoms/Text';
import { SearchBar } from './SearchBar';

// ── Public types ──────────────────────────────────────────────

export type PickerCategory = {
  id: string;
  name: string;
  balance: number;
};

export type GroupedCategory = {
  groupId: string;
  groupName: string;
  categories: PickerCategory[];
};

export type CategoryPickerListProps = {
  /** Title shown in the sticky header — omit to show only the search bar */
  title?: string;
  /** Grouped category data — filtering by search is handled internally */
  groups: GroupedCategory[];
  /** Called when a category row is tapped */
  onSelect: (cat: PickerCategory) => void;
  /** Custom right-side content per row (balance, checkmark, etc.) */
  renderRight?: (cat: PickerCategory) => ReactNode;
  /** Placeholder for the search bar */
  searchPlaceholder?: string;
  /** Message shown when the list is empty and there is no search query */
  emptyMessage?: string;
  /** Extra content rendered at the top of the scrollable list (below sticky header) */
  listHeaderExtra?: ReactNode;
  /** Auto-focus the search bar on mount */
  autoFocusSearch?: boolean;
};

// ── Internal types ────────────────────────────────────────────

type SectionHeaderItem = { type: 'section-header'; title: string; key: string };
type CategoryRowItem = {
  type: 'category';
  cat: PickerCategory;
  isFirst: boolean;
  isLast: boolean;
  key: string;
};
type ExtraItem = { type: 'extra'; key: string };
type ListItem = SectionHeaderItem | CategoryRowItem | ExtraItem;

// ── Component ─────────────────────────────────────────────────

export function CategoryPickerList({
  title,
  groups,
  onSelect,
  renderRight,
  searchPlaceholder = 'Search categories...',
  emptyMessage = 'No categories available',
  listHeaderExtra,
  autoFocusSearch,
}: CategoryPickerListProps) {
  const { colors, spacing, borderRadius: br, borderWidth: bw } = useTheme();
  const [search, setSearch] = useState('');

  const items = useMemo<ListItem[]>(() => {
    const query = search.toLowerCase().trim();
    const result: ListItem[] = [];
    for (const g of groups) {
      const cats = g.categories.filter((c) => {
        if (!query) return true;
        return c.name.toLowerCase().includes(query) || g.groupName.toLowerCase().includes(query);
      });
      if (cats.length === 0) continue;
      result.push({ type: 'section-header', title: g.groupName, key: `header-${g.groupId}` });
      cats.forEach((cat, i) => {
        result.push({
          type: 'category',
          cat,
          isFirst: i === 0,
          isLast: i === cats.length - 1,
          key: cat.id,
        });
      });
    }
    return result;
  }, [groups, search]);

  // listHeaderExtra is rendered as a scrollable item (index 1), not inside the sticky header
  const dataWithExtra = useMemo(() => {
    if (!listHeaderExtra) return items;
    return [{ type: 'extra' as const, key: '__extra__' }, ...items];
  }, [items, listHeaderExtra]);

  // stickyHeaderIndices=[0] always targets the ListHeaderComponent
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.pageBackground }}
      data={dataWithExtra}
      keyExtractor={(item) => item.key}
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={[0]}
      ListHeaderComponent={
        <View style={{ backgroundColor: colors.pageBackground, paddingTop: title ? spacing.xl : spacing.xs }}>
          {title ? (
            <Text
              variant="bodyLg"
              color={colors.textPrimary}
              style={{ paddingBottom: spacing.sm, paddingHorizontal: spacing.lg }}
            >
              {title}
            </Text>
          ) : null}
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            autoFocus={autoFocusSearch}
          />
        </View>
      }
      renderItem={({ item }) => {
        if (item.type === 'extra') {
          return <>{listHeaderExtra}</>;
        }
        if (item.type === 'section-header') {
          return (
            <View
              style={{
                backgroundColor: colors.pageBackground,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                paddingTop: spacing.md,
              }}
            >
              <Text
                variant="captionSm"
                color={colors.textMuted}
                style={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' }}
              >
                {item.title}
              </Text>
            </View>
          );
        }

        const { cat, isFirst, isLast } = item;
        return (
          <View
            style={{
              marginHorizontal: spacing.lg,
              backgroundColor: colors.cardBackground,
              borderColor: colors.cardBorder,
              borderLeftWidth: bw.thin,
              borderRightWidth: bw.thin,
              borderTopWidth: isFirst ? bw.thin : 0,
              borderBottomWidth: isLast ? bw.thin : 0,
              borderTopLeftRadius: isFirst ? br.md : 0,
              borderTopRightRadius: isFirst ? br.md : 0,
              borderBottomLeftRadius: isLast ? br.md : 0,
              borderBottomRightRadius: isLast ? br.md : 0,
              overflow: 'hidden' as const,
            }}
          >
            <Pressable
              style={({ pressed }) => [
                {
                  flexDirection: 'row' as const,
                  alignItems: 'center' as const,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 12,
                  minHeight: 44,
                },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => onSelect(cat)}
            >
              <Text
                variant="body"
                color={colors.textPrimary}
                style={{ flex: 1, marginRight: spacing.sm }}
                numberOfLines={1}
              >
                {cat.name}
              </Text>
              {renderRight?.(cat)}
            </Pressable>
            {/* Inset divider */}
            {!isLast && (
              <View
                style={{
                  height: bw.thin,
                  backgroundColor: colors.divider,
                  marginHorizontal: spacing.md,
                }}
              />
            )}
          </View>
        );
      }}
      ListEmptyComponent={
        <View style={{ alignItems: 'center', marginTop: 60, gap: 8 }}>
          <Text variant="bodyLg" color={colors.textSecondary}>No categories available</Text>
          <Text variant="bodySm" color={colors.textMuted}>
            {search ? 'No matches found' : emptyMessage}
          </Text>
        </View>
      }
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    />
  );
}
