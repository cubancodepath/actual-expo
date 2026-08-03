import { useCallback, useMemo, useRef } from "react";
import { FlatList, ScrollView, View } from "react-native";
import Animated, { FadeInUp, FadeOut } from "react-native-reanimated";
import { Stack, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { Spinner, useThemeColor } from "heroui-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useAccounts } from "@/lib/hooks/useAccounts";
import { DateHeader } from "@/screens/transactions/components/transaction-list/DateHeader";
import { LedgerRow } from "@/screens/transactions/components/transaction-list/LedgerRow";
import { TransactionRowMenuHost } from "@/screens/transactions/components/transaction-list/TransactionRowMenuHost";
import type { TxListItem } from "@/screens/transactions/components/transaction-list/listItems";
import { useSearchBridge } from "@/ui/NativePickerScreen/useSearchBridge";
import { SearchSuggestions } from "./components/SearchSuggestions";
import { SearchTags } from "./components/SearchTags";
import { NoSearchResults } from "./components/NoSearchResults";
import { useSearchController } from "./useSearchController";

// Built once — class instances that run on the UI thread, and the autocomplete
// toggles often.
//
// The curtain belongs to the field, which is at the top, so it unfurls DOWNWARD
// from it: `FadeInUp` is the one that starts above (translateY: -25) and settles
// — `FadeInDown` starts *below* and rises, which read as a panel flying up from
// the tab bar. The drop is shortened to 12px so it reads as unfurling rather
// than travelling.
const SUGGESTIONS_IN = FadeInUp.duration(180).withInitialValues({
  transform: [{ translateY: -12 }],
});
// Leaving is a quick fade, not a slide: picking a filter is a small act, and
// sliding a full-screen panel off the top for it reads as a screen transition.
// The results underneath are already correct by then, so there is nothing to
// hide on the way out.
const SUGGESTIONS_OUT = FadeOut.duration(140);

// Long enough to outlast a push transition (~400ms) plus a slow first frame,
// short enough that a bar which will never take focus stops being poked.
const FOCUS_RETRY_MS = 120;
const FOCUS_MAX_ATTEMPTS = 12;

export interface SearchScreenProps {
  /** Fixed account scope when opened from one account's ledger. */
  accountId?: string;
  initialFilter?: string;
}

/**
 * Transaction search: the field in the navigation bar, a short prioritized
 * suggestion list while it's focused (an "anything contains" row first), and
 * the chosen filters as removable tags. Every filter — including the free text —
 * is a token, and the paged result list updates live as tokens change.
 *
 * Serves both the global search (spending tab) and the account-scoped one
 * (account ledger); the scope is a fixed param, not a removable tag, and the
 * title names it so the scope is never a mystery.
 *
 * No back button: the field's own Cancel is the way out, sitting right beside
 * what you're typing in.
 *
 * The bar is translucent (the route seeds `pickerHeaderOptions`), so it does not
 * occupy layout — everything below has to take its top inset from UIKit via
 * `contentInsetAdjustmentBehavior`, or it renders underneath the bar. That is
 * also why the results are a plain `FlatList`: `LegendList` reads the raw
 * content offset and an adjusted one puts its virtualization window off the end
 * of the data, leaving the list blank.
 */
export function SearchScreen({ accountId, initialFilter }: SearchScreenProps) {
  const { t } = useTranslation("transactions");
  const [foreground, accent] = useThemeColor(["foreground", "accent"]);
  const { accounts } = useAccounts();
  const search = useSearchController({ accountId, initialFilter });

  const title = accountId
    ? (accounts.find((a) => a.id === accountId)?.name ?? t("list.title"))
    : t("list.title");

  const headerOptions = useMemo<NativeStackNavigationOptions>(
    // The field's Cancel leaves the screen; a chevron beside it would be a
    // second way to do the same thing.
    () => ({ title, headerBackVisible: false }),
    [title],
  );

  // The bar is uncontrolled; the bridge keeps its handler identity stable so
  // typing never re-registers it (which would rebuild it and drop the keyboard).
  const { searchBarRef, onChangeText } = useSearchBridge(search.searchText, search.setSearchText);

  // A ref, not `search.searchFocused`: the retry loop below runs from inside an
  // interval closure, which would keep reading the state value it was created
  // with and never stop.
  const focusedRef = useRef(false);

  const onFieldFocus = () => {
    focusedRef.current = true;
    search.setSearchFocused(true);
  };

  const onFieldBlur = () => {
    focusedRef.current = false;
    search.setSearchFocused(false);
  };

  /**
   * Focus the field every time the screen is shown.
   *
   * Imperative because `SearchBar`'s `autoFocus` prop is declared in its types
   * and its Fabric spec but is only implemented on Android — there is no
   * reference to it anywhere in `react-native-screens/ios`.
   *
   * Retried rather than fired once because the native `focus()` is a bare
   * `[searchBar becomeFirstResponder]` (RNSSearchBar.mm), which returns NO —
   * silently, no throw, no log — while the bar is not yet in a window. That is
   * the whole push transition, so any single delay is a race we lose. There is
   * no success signal from native either; the only proof focus landed is the
   * bar's own `onFocus`, so we keep asking until it fires.
   *
   * On navigation focus rather than on mount: the screen stays mounted while a
   * transaction is opened from a result, so a mount effect would fire once and
   * never again on the way back.
   */
  useFocusEffect(
    useCallback(() => {
      let attempts = 0;
      const timer = setInterval(() => {
        if (focusedRef.current || attempts >= FOCUS_MAX_ATTEMPTS) {
          clearInterval(timer);
          return;
        }
        attempts += 1;
        searchBarRef.current?.focus();
      }, FOCUS_RETRY_MS);
      return () => clearInterval(timer);
    }, [searchBarRef, focusedRef]),
  );

  /**
   * Picking a suggestion also drops the keyboard. The controller flips its own
   * `searchFocused` to close the curtain, but the native field would keep focus
   * — and then no `onFocus` would ever fire again, so the autocomplete would
   * stay shut for the rest of the session.
   */
  const pickSuggestion = (token: Parameters<typeof search.addFilterToken>[0]) => {
    search.addFilterToken(token);
    searchBarRef.current?.blur();
  };

  return (
    <TransactionRowMenuHost className="flex-1 bg-background">
      {({ liftedTxnId, onLongPressRow, isIncomeTxn }) => (
        <>
          <Stack.Screen options={headerOptions} />
          <Stack.SearchBar
            ref={searchBarRef}
            placeholder={t(search.placeholderKey)}
            placement="stacked"
            hideWhenScrolling={false}
            hideNavigationBar={false}
            autoCapitalize="none"
            textColor={foreground}
            tintColor={accent}
            onChangeText={onChangeText}
            onFocus={onFieldFocus}
            onBlur={onFieldBlur}
            onSearchButtonPress={search.onSubmitText}
            onCancelButtonPress={search.close}
          />

          <FlatList
            data={search.items}
            keyExtractor={(item: TxListItem) => item.key}
            extraData={liftedTxnId}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            // The bar floats over this; UIKit supplies the inset that keeps the
            // first row out from under it.
            contentInsetAdjustmentBehavior="automatic"
            renderItem={({ item }: { item: TxListItem }) => {
              if (item.type === "header") return <DateHeader date={item.date} />;
              return (
                <LedgerRow
                  txn={item.txn}
                  isFirst={item.isFirst}
                  isIncome={isIncomeTxn(item.txn)}
                  onPress={search.onPressRow}
                  onLongPress={onLongPressRow}
                  isLifted={liftedTxnId === item.txn.id}
                />
              );
            }}
            // Inside the scroll content, not above it: with a translucent bar
            // nothing can sit "over" the list in the flow without being hidden.
            ListHeaderComponent={
              search.tokens.length > 0 ? (
                <SearchTags tokens={search.tokens} onRemove={search.removeTokensByKey} />
              ) : null
            }
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

          {/* Opaque curtain over the results while the autocomplete is open, so
              they never move underneath. A scroll view rather than a plain one
              purely for its content inset — the suggestions are short, but their
              first rows would otherwise sit under the translucent bar. */}
          {search.searchFocused && search.suggestions.length > 0 && (
            <Animated.View
              entering={SUGGESTIONS_IN}
              exiting={SUGGESTIONS_OUT}
              className="absolute inset-0 bg-background"
            >
              <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <SearchSuggestions suggestions={search.suggestions} onSelect={pickSuggestion} />
              </ScrollView>
            </Animated.View>
          )}
        </>
      )}
    </TransactionRowMenuHost>
  );
}
