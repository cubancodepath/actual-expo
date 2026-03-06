import { useCallback, useEffect, useRef, useState } from 'react';
import { useRefreshControl } from '../../../src/presentation/hooks/useRefreshControl';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import {
  searchTransactions,
  type TransactionDisplay,
} from '../../../src/transactions';
import type { SearchToken } from '../../../src/transactions/types';
import { useCategoriesStore } from '../../../src/stores/categoriesStore';
import { useTheme } from '../../../src/presentation/providers/ThemeProvider';
import { EmptyState } from '../../../src/presentation/components';
import { TransactionRow } from '../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../src/presentation/components/account/DateSectionHeader';
import { TokenSearchBar } from '../../../src/presentation/components/transaction/TokenSearchBar';
import { SearchSuggestions } from '../../../src/presentation/components/transaction/SearchSuggestions';
import { useTagsStore } from '../../../src/stores/tagsStore';
import { GlassButton } from '../../../src/presentation/components/atoms/GlassButton';

// ---------------------------------------------------------------------------
// Types for mixed FlashList data
// ---------------------------------------------------------------------------

type DateHeader = { type: 'date'; date: number; key: string };
type TransactionItem = {
  type: 'transaction';
  data: TransactionDisplay;
  key: string;
  isFirst: boolean;
  isLast: boolean;
};
type ListItem = DateHeader | TransactionItem;

function buildListData(transactions: TransactionDisplay[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDate: number | null = null;

  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    const isNewDate = txn.date !== lastDate;
    if (isNewDate) {
      if (items.length > 0) {
        const prev = items[items.length - 1];
        if (prev.type === 'transaction') prev.isLast = true;
      }
      items.push({ type: 'date', date: txn.date, key: `date-${txn.date}` });
      lastDate = txn.date;
    }
    items.push({
      type: 'transaction',
      data: txn,
      key: txn.id,
      isFirst: isNewDate,
      isLast: false,
    });
  }

  if (items.length > 0) {
    const last = items[items.length - 1];
    if (last.type === 'transaction') last.isLast = true;
  }

  return items;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSearchParams(tkns: SearchToken[]) {
  const params: Record<string, unknown> = {};
  for (const t of tkns) {
    if (t.type === 'status') params[t.value] = true;
    if (t.type === 'category') params.categoryId = t.categoryId;
    if (t.type === 'tag') params.tagName = t.tagName;
  }
  return params;
}

const STATUS_EXCLUSIONS: Record<string, string> = {
  cleared: 'uncleared',
  uncleared: 'cleared',
  reconciled: 'unreconciled',
  unreconciled: 'reconciled',
};

const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AccountSearchScreen() {
  const { accountId, accountName } = useLocalSearchParams<{ accountId: string; accountName: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const { categories } = useCategoriesStore();
  const tags = useTagsStore((s) => s.tags);

  // Search state
  const searchInputRef = useRef<TextInput>(null);
  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(true);
  const [tokens, setTokens] = useState<SearchToken[]>([]);

  // Results
  const [results, setResults] = useState<TransactionDisplay[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);

  // Auto-focus on mount
  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const hasResults = hasSearched && results.length > 0;

  // ---- Header ----
  useEffect(() => {
    navigation.setOptions({
      title: accountName || 'Account',
      headerRight: undefined,
      unstable_headerRightItems: () => [
        {
          type: 'button' as const,
          label: 'Select',
          disabled: !hasResults,
          onPress: () => {},
        },
      ],
    });
  }, [hasResults, accountName]);

  // ---- Token management ----

  function handleAddToken(token: SearchToken) {
    setTokens(prev => {
      const filtered = prev.filter(t => {
        if (t.type === token.type && token.type === 'category') return false;
        if (t.type === token.type && token.type === 'tag') return false;
        if (t.type === 'status' && token.type === 'status' && t.value === token.value) return false;
        if (t.type === 'status' && token.type === 'status' && STATUS_EXCLUSIONS[token.value] === t.value) return false;
        return true;
      });
      return [...filtered, token];
    });
    setSearchText('');
  }

  function handleRemoveToken(index: number) {
    const next = tokens.filter((_, i) => i !== index);
    setTokens(next);
    if (!hasSearched) return;
    if (next.length === 0 && !searchText) {
      setResults([]);
      setHasSearched(false);
    } else {
      // Re-execute search with remaining filters
      offsetRef.current = 0;
      searchTransactions({
        text: searchText || undefined,
        accountId,
        ...buildSearchParams(next),
        limit: PAGE_SIZE,
        offset: 0,
      }).then(txns => {
        setResults(txns);
        setHasMore(txns.length === PAGE_SIZE);
        offsetRef.current = txns.length;
      });
    }
  }

  function handleClear() {
    setSearchText('');
    setTokens([]);
    setResults([]);
    setHasSearched(false);
  }

  // ---- Search execution ----

  const executeSearch = useCallback(async () => {
    Keyboard.dismiss();
    offsetRef.current = 0;
    const txns = await searchTransactions({
      text: searchText || undefined,
      accountId,
      ...buildSearchParams(tokens),
      limit: PAGE_SIZE,
      offset: 0,
    });
    setResults(txns);
    setHasSearched(true);
    setHasMore(txns.length === PAGE_SIZE);
    offsetRef.current = txns.length;
  }, [searchText, tokens, accountId]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !hasSearched) return;
    setLoadingMore(true);
    try {
      const txns = await searchTransactions({
        text: searchText || undefined,
        accountId,
        ...buildSearchParams(tokens),
        limit: PAGE_SIZE,
        offset: offsetRef.current,
      });
      if (txns.length === 0) { setHasMore(false); return; }
      setResults(prev => [...prev, ...txns]);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current += txns.length;
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, hasSearched, searchText, tokens, accountId]);

  const { refreshControlProps } = useRefreshControl({
    syncFirst: false,
    onRefresh: async () => {
      if (!hasSearched) return;
      offsetRef.current = 0;
      const txns = await searchTransactions({
        text: searchText || undefined,
        accountId,
        ...buildSearchParams(tokens),
        limit: PAGE_SIZE,
        offset: 0,
      });
      setResults(txns);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current = txns.length;
    },
  });

  // ---- Transaction handlers ----

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } });
  }

  // ---- Render ----

  const listData = hasSearched ? buildListData(results) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.pageBackground }}>
      <View style={{ backgroundColor: colors.pageBackground }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 }}>
          <View style={{ flex: 1 }}>
            <TokenSearchBar
              text={searchText}
              onChangeText={setSearchText}
              tokens={tokens}
              onRemoveToken={handleRemoveToken}
              onClear={handleClear}
              onFocusChange={setSearchFocused}
              onSubmit={executeSearch}
              inputRef={searchInputRef}
              noHorizontalMargin
            />
          </View>
          <GlassButton icon="close" iconSize={18} onPress={() => router.back()} hitSlop={4} />
        </View>
        {searchFocused && (
          <SearchSuggestions
            text={searchText}
            tokens={tokens}
            accounts={[]}
            categories={categories.filter(c => !c.hidden && !c.is_income).map(c => ({ id: c.id, name: c.name }))}
            tags={tags}
            onSelect={handleAddToken}
          />
        )}
      </View>

      <FlashList<ListItem>
        data={listData}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        renderItem={({ item }) => {
          if (item.type === 'date') {
            return <DateSectionHeader date={item.date} />;
          }
          return (
            <TransactionRow
              item={item.data}
              onPress={handleEditTransaction}
              onDelete={handleEditTransaction}
              onToggleCleared={handleEditTransaction}
              tags={tags}
              isFirst={item.isFirst}
              isLast={item.isLast}
            />
          );
        }}
        ListFooterComponent={
          loadingMore
            ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 20 }} />
            : null
        }
        ListEmptyComponent={
          hasSearched
            ? <EmptyState
                icon="search-outline"
                title="No matching transactions"
                description="Try different search terms or filters"
              />
            : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl {...refreshControlProps} />
        }
        contentContainerStyle={{ paddingBottom: 80, backgroundColor: colors.pageBackground }}
      />
    </View>
  );
}
