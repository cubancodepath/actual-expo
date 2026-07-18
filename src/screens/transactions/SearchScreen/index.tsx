import { View } from "react-native";
import Animated, { FadeInDown, LinearTransition, SlideOutUp } from "react-native-reanimated";
import { LegendList } from "@legendapp/list";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, SearchField, Spinner, useThemeColor } from "heroui-native";
import { X } from "lucide-react-native";
import { DateHeader } from "@/screens/transactions/components/transaction-list/DateHeader";
import { TransactionRow } from "@/screens/transactions/components/transaction-list/TransactionRow";
import { TransactionRowMenuHost } from "@/screens/transactions/components/transaction-list/TransactionRowMenuHost";
import type { TxListItem } from "@/screens/transactions/components/transaction-list/listItems";
import { SearchSuggestions } from "./components/SearchSuggestions";
import { SearchTags } from "./components/SearchTags";
import { NoSearchResults } from "./components/NoSearchResults";
import { useSearchController } from "./hooks/useSearchController";

// Entering/exiting builders are class instances — build them once so toggling
// the autocomplete doesn't allocate new ones per render. They run on the UI
// thread. The autocomplete is an opaque full-height curtain over the results:
// it drops in with a fade, but leaves by SLIDING up with no fade — the results
// are revealed bottom-up as the curtain lifts, so they can't show through
// while it's still on its way out, and the list underneath never re-layouts.
const SUGGESTIONS_IN = FadeInDown.duration(180);
const SUGGESTIONS_OUT = SlideOutUp.duration(220);
const HEADER_LAYOUT = LinearTransition.duration(180);

export interface SearchScreenProps {
  /** Fixed account scope when opened from one account's ledger. */
  accountId?: string;
  initialFilter?: string;
}

/**
 * Transaction search as a classic autocomplete: a clean `SearchField`, a
 * short prioritized suggestion list while it's focused (an "anything
 * contains" row first), and the chosen filters as removable tags below the
 * bar. Every filter — including the free text — is a token, and the paged
 * result list updates live as tokens change. Serves both the global search
 * (spending tab) and the account-scoped search (account ledger) — the scope
 * is a fixed param, not a removable tag. Row actions go through the shared
 * long-press menu. All state lives in `useSearchController`; this is just the
 * composition.
 */
export function SearchScreen({ accountId, initialFilter }: SearchScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("transactions");
  const foreground = useThemeColor("foreground");
  const search = useSearchController({ accountId, initialFilter });

  return (
    <TransactionRowMenuHost className="flex-1 bg-background">
      {({ liftedTxnId, onLongPressRow, isIncomeTxn }) => (
        <>
          <Animated.View layout={HEADER_LAYOUT} style={{ paddingTop: insets.top }}>
            <View className="flex-row items-center gap-2 px-3 py-2">
              <SearchField
                value={search.searchText}
                onChange={search.setSearchText}
                className="flex-1"
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input
                    ref={search.searchInputRef}
                    placeholder={t(search.placeholderKey)}
                    onFocus={() => search.setSearchFocused(true)}
                    onBlur={() => search.setSearchFocused(false)}
                    onKeyPress={search.onBackspace}
                    onSubmitEditing={search.onSubmitText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <Button isIconOnly variant="secondary" size="sm" onPress={search.close}>
                <X size={20} color={foreground} />
              </Button>
            </View>
            <SearchTags tokens={search.tokens} onRemove={search.removeTokensByKey} />
          </Animated.View>

          <Animated.View layout={HEADER_LAYOUT} className="flex-1 overflow-hidden">
            <LegendList
              data={search.items}
              keyExtractor={(item: TxListItem) => item.key}
              getItemType={(item: TxListItem) => item.type}
              extraData={liftedTxnId}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }: { item: TxListItem }) => {
                if (item.type === "header") return <DateHeader date={item.date} />;
                return (
                  <TransactionRow
                    txn={item.txn}
                    isFirst={item.isFirst}
                    isIncome={isIncomeTxn(item.txn)}
                    onPress={search.onPressRow}
                    onLongPress={onLongPressRow}
                    isLifted={liftedTxnId === item.txn.id}
                  />
                );
              }}
              onEndReached={() => {
                if (search.hasNextPage) search.fetchNextPage();
              }}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                search.isFetchingNextPage ? (
                  <View className="items-center py-5">
                    <Spinner size="sm" />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                !search.hasSearched || search.isPending ? null : <NoSearchResults />
              }
              contentContainerStyle={{ paddingBottom: 80 }}
            />

            {/* Curtain overlay: covers the results entirely while the
                autocomplete is open; they never move underneath. */}
            {search.searchFocused && search.suggestions.length > 0 && (
              <Animated.View
                entering={SUGGESTIONS_IN}
                exiting={SUGGESTIONS_OUT}
                className="absolute inset-0 bg-background"
              >
                <SearchSuggestions
                  suggestions={search.suggestions}
                  onSelect={search.addFilterToken}
                />
              </Animated.View>
            )}
          </Animated.View>
        </>
      )}
    </TransactionRowMenuHost>
  );
}
