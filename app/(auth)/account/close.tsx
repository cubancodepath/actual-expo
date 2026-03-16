import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAccountsStore } from "@/stores/accountsStore";
import { useCategoriesStore } from "@/stores/categoriesStore";
import { useUndoStore } from "@/stores/undoStore";
import { getAccountProperties, groupAccounts } from "@/accounts";
import { useTheme, useThemedStyles } from "@/presentation/providers/ThemeProvider";
import { Text } from "@/presentation/components/atoms/Text";
import { Button } from "@/presentation/components/atoms/Button";
import { IconButton } from "@/presentation/components/atoms/IconButton";
import { formatBalance } from "@/lib/format";
import { Divider } from "@/presentation/components/atoms/Divider";
import type { Account } from "@/accounts/types";
import type { Category, CategoryGroup } from "@/categories/types";
import { useTranslation } from "react-i18next";
import type { Theme } from "@/theme";

function needsCategory(account: Account, transferAccountId: string, accounts: Account[]): boolean {
  const transferAcct = accounts.find((a) => a.id === transferAccountId);
  return !account.offbudget && !!transferAcct?.offbudget;
}

export default function CloseAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  const { t } = useTranslation("accounts");
  const { t: tc } = useTranslation("common");
  const { accounts, close, load } = useAccountsStore();
  const { categories, groups } = useCategoriesStore();
  const account = accounts.find((a) => a.id === id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [balance, setBalance] = useState(0);
  const [transferAccountId, setTransferAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [transferError, setTransferError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);

  useEffect(() => {
    if (!id) return;
    getAccountProperties(id).then(({ balance, numTransactions }) => {
      setBalance(balance);
      setCanDelete(numTransactions === 0);
      setLoading(false);
    });
  }, [id]);

  if (!account || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  const openAccounts = accounts.filter((a) => !a.closed && !a.tombstone && a.id !== id);
  const showTransfer = balance !== 0;
  const showCategory =
    transferAccountId != null && needsCategory(account, transferAccountId, accounts);

  // Filter to expense categories only (not income groups)
  const expenseGroups = groups.filter((g) => !g.is_income && !g.tombstone);
  const expenseCategories = categories.filter(
    (c) =>
      !c.is_income && !c.tombstone && !c.hidden && expenseGroups.some((g) => g.id === c.cat_group),
  );

  async function handleSubmit() {
    const hasTransferError = balance !== 0 && !transferAccountId;
    const hasCategoryError =
      transferAccountId != null &&
      needsCategory(account!, transferAccountId, accounts) &&
      !categoryId;

    setTransferError(hasTransferError);
    setCategoryError(hasCategoryError);

    if (hasTransferError || hasCategoryError) return;

    setSaving(true);
    try {
      await close({
        id,
        transferAccountId: transferAccountId ?? undefined,
        categoryId: categoryId ?? undefined,
      });
      await load();
      useUndoStore
        .getState()
        .showUndo(canDelete ? t("close.accountDeleted") : t("close.accountClosed"));
      router.dismiss();
    } finally {
      setSaving(false);
    }
  }

  function handleForceClose() {
    Alert.alert(t("close.forceCloseTitle"), t("close.forceCloseMessage", { name: account!.name }), [
      { text: tc("cancel"), style: "cancel" },
      {
        text: t("close.forceClose"),
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          try {
            await close({ id, forced: true });
            await load();
            useUndoStore.getState().showUndo(t("close.accountDeleted"));
            router.dismiss();
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton
              sfSymbol="xmark"
              size={22}
              color={theme.colors.headerText}
              onPress={() => router.back()}
            />
          ),
        }}
      />

      {/* Confirmation text */}
      <Text variant="body" color={theme.colors.textPrimary} style={styles.paragraph}>
        {t("close.confirmMessage")}
        <Text variant="body" color={theme.colors.textPrimary} style={{ fontWeight: "700" }}>
          {account.name}
        </Text>
        ?
      </Text>

      <Text variant="bodySm" color={theme.colors.textSecondary} style={styles.paragraph}>
        {canDelete ? t("close.noTransactions") : t("close.hasTransactions")}
      </Text>

      {/* Balance transfer section */}
      {showTransfer && (
        <>
          <Divider style={styles.divider} />

          <Text variant="bodySm" color={theme.colors.textSecondary} style={styles.paragraph}>
            {t("close.balanceTransferMessage", { balance: formatBalance(balance) })}
          </Text>

          {transferError && (
            <Text variant="captionSm" color={theme.colors.errorText} style={styles.errorText}>
              {t("close.transferRequired")}
            </Text>
          )}

          <AccountPickerList
            accounts={openAccounts}
            selectedId={transferAccountId}
            onSelect={(accId) => {
              setTransferAccountId(accId);
              setTransferError(false);
              // Reset category if transfer target changes
              setCategoryId(null);
              setCategoryError(false);
            }}
            styles={styles}
          />
        </>
      )}

      {/* Category picker section */}
      {showCategory && (
        <>
          <Divider style={styles.divider} />

          <Text variant="bodySm" color={theme.colors.textSecondary} style={styles.paragraph}>
            {t("close.categoryTransferMessage")}
          </Text>

          {categoryError && (
            <Text variant="captionSm" color={theme.colors.errorText} style={styles.errorText}>
              {t("close.categoryRequired")}
            </Text>
          )}

          <CategoryPickerList
            categories={expenseCategories}
            groups={expenseGroups}
            selectedId={categoryId}
            onSelect={(catId) => {
              setCategoryId(catId);
              setCategoryError(false);
            }}
            styles={styles}
          />
        </>
      )}

      {/* Force close option */}
      {!canDelete && (
        <>
          <Divider style={styles.divider} />
          <Text variant="captionSm" color={theme.colors.textMuted} style={styles.paragraph}>
            {t("close.forceCloseHint")}
            <Text
              variant="captionSm"
              color={theme.colors.errorText}
              style={{ fontWeight: "600" }}
              onPress={handleForceClose}
            >
              {t("close.forceCloseLink")}
            </Text>
            {t("close.forceCloseDescription")}
          </Text>
        </>
      )}

      {/* Action buttons */}
      <View style={styles.buttonRow}>
        <Button
          title={tc("cancel")}
          variant="secondary"
          onPress={() => router.back()}
          style={styles.buttonFlex}
        />
        <Button
          title={t("close.title")}
          variant="danger"
          onPress={handleSubmit}
          loading={saving}
          style={styles.buttonFlex}
        />
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Account picker (inline list)
// ---------------------------------------------------------------------------

function AccountPickerList({
  accounts,
  selectedId,
  onSelect,
  styles,
}: {
  accounts: Account[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const theme = useTheme();
  const groups = groupAccounts(accounts);

  return (
    <View style={styles.pickerCard}>
      {groups.map((group, gi) => (
        <View key={group.type}>
          {gi > 0 && <Divider />}
          <View style={styles.pickerGroupHeader}>
            <Text variant="captionSm" color={theme.colors.textMuted} style={{ fontWeight: "600" }}>
              {group.label}
            </Text>
          </View>
          {group.accounts.map((acct) => {
            const selected = acct.id === selectedId;
            return (
              <Pressable
                key={acct.id}
                style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                onPress={() => onSelect(acct.id)}
              >
                <Text
                  variant="body"
                  color={selected ? theme.colors.primary : theme.colors.textPrimary}
                  style={[styles.pickerRowText, selected && { fontWeight: "600" as const }]}
                >
                  {acct.name}
                </Text>
                {selected && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Category picker (inline list)
// ---------------------------------------------------------------------------

function CategoryPickerList({
  categories,
  groups,
  selectedId,
  onSelect,
  styles,
}: {
  categories: Category[];
  groups: CategoryGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const theme = useTheme();

  return (
    <View style={styles.pickerCard}>
      {groups.map((group, gi) => {
        const groupCats = categories.filter((c) => c.cat_group === group.id);
        if (groupCats.length === 0) return null;
        return (
          <View key={group.id}>
            {gi > 0 && <Divider />}
            <View style={styles.pickerGroupHeader}>
              <Text
                variant="captionSm"
                color={theme.colors.textMuted}
                style={{ fontWeight: "600" }}
              >
                {group.name}
              </Text>
            </View>
            {groupCats.map((cat) => {
              const selected = cat.id === selectedId;
              return (
                <Pressable
                  key={cat.id}
                  style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                  onPress={() => onSelect(cat.id)}
                >
                  <Text
                    variant="body"
                    color={selected ? theme.colors.primary : theme.colors.textPrimary}
                    style={[styles.pickerRowText, selected && { fontWeight: "600" as const }]}
                  >
                    {cat.name}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (theme: Theme) => ({
  flex: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
  },
  center: {
    flex: 1,
    backgroundColor: theme.colors.pageBackground,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  container: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
  },
  paragraph: {
    marginBottom: theme.spacing.md,
  },
  divider: {
    marginVertical: theme.spacing.lg,
  },
  errorText: {
    marginBottom: theme.spacing.sm,
  },

  // Picker card
  pickerCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth.default,
    borderColor: theme.colors.cardBorder,
    overflow: "hidden" as const,
  },
  pickerGroupHeader: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.pageBackground,
  },
  pickerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    minHeight: 44,
  },
  pickerRowSelected: {
    backgroundColor: `${theme.colors.primary}10`,
  },
  pickerRowText: {
    flex: 1,
  },

  // Buttons
  buttonRow: {
    flexDirection: "row" as const,
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl,
  },
  buttonFlex: {
    flex: 1,
  },
});
