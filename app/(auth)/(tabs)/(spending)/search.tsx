import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { BlurView } from 'expo-blur';
import {
  searchTransactions,
  type TransactionDisplay,
} from '../../../../src/transactions';
import type { SearchToken } from '../../../../src/transactions/types';
import { useAccountsStore } from '../../../../src/stores/accountsStore';
import { useCategoriesStore } from '../../../../src/stores/categoriesStore';
import { useSpendingStore } from '../../../../src/stores/spendingStore';
import { useTheme } from '../../../../src/presentation/providers/ThemeProvider';
import { EmptyState } from '../../../../src/presentation/components';
import { TransactionRow } from '../../../../src/presentation/components/account/TransactionRow';
import { DateSectionHeader } from '../../../../src/presentation/components/account/DateSectionHeader';
import { TokenSearchBar } from '../../../../src/presentation/components/transaction/TokenSearchBar';
import { SearchSuggestions } from '../../../../src/presentation/components/transaction/SearchSuggestions';

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
    if (t.type === 'account') params.accountId = t.accountId;
    if (t.type === 'category') params.categoryId = t.categoryId;
  }
  return params;
}

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SearchScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useTheme();
  const { accounts } = useAccountsStore();
  const { categories } = useCategoriesStore();
  const { hideReconciled } = useSpendingStore();

  // Search state
  const searchInputRef = useRef<TextInput>(null);
  const [searchText, setSearchText] = useState('');
  const [searchFocused, setSearchFocused] = useState(true);
  const [tokens, setTokens] = useState<SearchToken[]>([]);

  // Results
  const [results, setResults] = useState<TransactionDisplay[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
      headerRight: undefined,
      unstable_headerRightItems: () => [
        {
          type: 'button' as const,
          label: 'Select',
          disabled: !hasResults,
          onPress: () => {
            // TODO: enter select mode on search results
          },
        },
      ],
    });
  }, [hasResults]);

  // ---- Token management ----

  const STATUS_EXCLUSIONS: Record<string, string> = {
    cleared: 'uncleared',
    uncleared: 'cleared',
    reconciled: 'unreconciled',
    unreconciled: 'reconciled',
  };

  function handleAddToken(token: SearchToken) {
    setTokens(prev => {
      const filtered = prev.filter(t => {
        // Replace same-type account/category
        if (t.type === token.type && token.type === 'account') return false;
        if (t.type === token.type && token.type === 'category') return false;
        // Remove duplicate status
        if (t.type === 'status' && token.type === 'status' && t.value === token.value) return false;
        // Remove mutually exclusive status (cleared/uncleared, reconciled/unreconciled)
        if (t.type === 'status' && token.type === 'status' && STATUS_EXCLUSIONS[token.value] === t.value) return false;
        return true;
      });
      return [...filtered, token];
    });
    setSearchText('');
  }

  function handleRemoveToken(index: number) {
    setTokens(prev => prev.filter((_, i) => i !== index));
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
      ...buildSearchParams(tokens),
      hideReconciled,
      limit: PAGE_SIZE,
      offset: 0,
    });
    setResults(txns);
    setHasSearched(true);
    setHasMore(txns.length === PAGE_SIZE);
    offsetRef.current = txns.length;
  }, [searchText, tokens, hideReconciled]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !hasSearched) return;
    setLoadingMore(true);
    try {
      const txns = await searchTransactions({
        text: searchText || undefined,
        ...buildSearchParams(tokens),
        hideReconciled,
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
  }, [loadingMore, hasMore, hasSearched, searchText, tokens, hideReconciled]);

  const onRefresh = useCallback(async () => {
    if (!hasSearched) return;
    setRefreshing(true);
    offsetRef.current = 0;
    try {
      const txns = await searchTransactions({
        text: searchText || undefined,
        ...buildSearchParams(tokens),
        hideReconciled,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setResults(txns);
      setHasMore(txns.length === PAGE_SIZE);
      offsetRef.current = txns.length;
    } finally {
      setRefreshing(false);
    }
  }, [hasSearched, searchText, tokens, hideReconciled]);

  // ---- Transaction handlers ----

  function handleEditTransaction(txnId: string) {
    router.push({ pathname: '/(auth)/transaction/new', params: { transactionId: txnId } });
  }

  // ---- Render ----

  const listData = hasSearched ? buildListData(results) : [];
  const glass = isLiquidGlassAvailable();

  const dismissIcon = (
    <Ionicons name="close" size={18} color={colors.textPrimary} />
  );

  return (
    <>
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
          <View style={{ borderRadius: 50, overflow: 'hidden' }}>
            <Pressable onPress={() => router.back()} hitSlop={4}>
              {glass ? (
                <GlassView isInteractive style={{ borderRadius: 50, padding: 13 }}>
                  {dismissIcon}
                </GlassView>
              ) : (
                <BlurView tint="systemChromeMaterial" intensity={100} style={{ borderRadius: 50, padding: 13 }}>
                  {dismissIcon}
                </BlurView>
              )}
            </Pressable>
          </View>
        </View>
        {searchFocused && (
          <SearchSuggestions
            text={searchText}
            tokens={tokens}
            accounts={accounts.filter(a => !a.closed).map(a => ({ id: a.id, name: a.name }))}
            categories={categories.filter(c => !c.hidden && !c.is_income).map(c => ({ id: c.id, name: c.name }))}
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
              showAccountName
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 80, backgroundColor: colors.pageBackground }}
      />
    </>
  );
}
