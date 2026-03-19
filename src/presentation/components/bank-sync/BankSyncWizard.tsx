import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, useThemedStyles } from "../../providers/ThemeProvider";
import { Text } from "../atoms/Text";
import { GoCardlessIcon } from "../atoms/GoCardlessIcon";
import { Button } from "../atoms/Button";
import { ListItem } from "../molecules/ListItem";
import { SearchBar } from "../molecules/SearchBar";
import { EmptyState } from "../molecules/EmptyState";
import { Banner } from "../molecules/Banner";
import { WizardShell, useWizardTransition, type WizardDirection } from "../wizard";
import { useBankSyncStore } from "../../../stores/bankSyncStore";
import { createAccount } from "../../../accounts";
import {
  getGoCardlessBanks,
  createGoCardlessWebToken,
  getGoCardlessAccounts,
  getSimpleFinAccounts,
} from "../../../bank-sync/service";
import { linkAccount, syncAccount } from "../../../bank-sync";
import { formatBalance } from "../../../lib/format";
import { useTranslation } from "react-i18next";
import type { GoCardlessBank, GoCardlessAccount, SimpleFinAccount } from "../../../bank-sync/types";
import type { Theme } from "../../../theme";

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const GC_STEPS = ["country", "institution", "consent", "bank-accounts"] as const;
const SF_STEPS = ["sf-accounts"] as const;
const ALL_STEPS = ["provider", ...GC_STEPS, ...SF_STEPS] as const;
type Step = (typeof ALL_STEPS)[number];

// Country data
const COUNTRIES = [
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "GB", name: "United Kingdom" },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  /** Account to link (required for mode "link") */
  localAccountId?: string;
  /** "link" = link existing account, "create" = create new account + link */
  mode?: "link" | "create";
  /** Off-budget flag for newly created accounts (mode "create") */
  offbudget?: boolean;
  /** Called when wizard finishes or is dismissed */
  onClose: () => void;
  /** Called after a new account is created and linked (mode "create") */
  onAccountCreated?: (accountId: string) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BankSyncWizard({
  localAccountId,
  mode = "link",
  offbudget = false,
  onClose,
  onAccountCreated,
}: Props) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { t } = useTranslation("bankSync");
  const { goCardlessConfigured, simpleFinConfigured } = useBankSyncStore();

  // Determine initial step
  const bothConfigured = goCardlessConfigured && simpleFinConfigured;
  const initialStep: Step = bothConfigured
    ? "provider"
    : goCardlessConfigured
      ? "country"
      : "sf-accounts";

  // Step state
  const [step, setStep] = useState<Step>(initialStep);
  const [prevStep, setPrevStep] = useState<Step | null>(null);

  // Data collected across steps
  const [country, setCountry] = useState<string | null>(null);
  const [banks, setBanks] = useState<GoCardlessBank[]>([]);
  const [institution, setInstitution] = useState<GoCardlessBank | null>(null);
  const [requisitionId, setRequisitionId] = useState<string | null>(null);
  const [gcAccounts, setGcAccounts] = useState<GoCardlessAccount[]>([]);
  const [sfAccounts, setSfAccounts] = useState<SimpleFinAccount[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentState, setConsentState] = useState<"idle" | "waiting" | "checking">("idle");

  // Transition animation
  const transition = useWizardTransition();

  // Active steps for progress (depends on provider path)
  const activeSteps = useMemo((): readonly string[] => {
    if (step === "sf-accounts") return SF_STEPS;
    if (step === "provider") return ALL_STEPS.slice(0, 5); // provider + GC
    // GoCardless path
    return bothConfigured ? ["provider", ...GC_STEPS] : [...GC_STEPS];
  }, [step, bothConfigured]);

  const stepIndex = activeSteps.indexOf(step);

  // Navigation
  function goTo(next: Step) {
    const dir: WizardDirection =
      ALL_STEPS.indexOf(next) > ALL_STEPS.indexOf(step) ? "forward" : "backward";
    setPrevStep(step);
    setStep(next);
    setSearch("");
    transition.trigger(dir, () => setPrevStep(null));
  }

  function handleBack() {
    const backMap: Partial<Record<Step, Step>> = {
      country: bothConfigured ? "provider" : undefined,
      institution: "country",
      consent: "institution",
      "bank-accounts": "consent",
      "sf-accounts": bothConfigured ? "provider" : undefined,
    };
    const prev = backMap[step];
    if (prev) goTo(prev);
    else onClose();
  }

  // ---------------------------------------------------------------------------
  // Data fetchers
  // ---------------------------------------------------------------------------

  async function loadBanks(countryCode: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await getGoCardlessBanks(countryCode, true);
      setBanks(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function startConsent(bank: GoCardlessBank) {
    setLoading(true);
    setError(null);
    try {
      const { link, requisitionId: reqId } = await createGoCardlessWebToken(bank.id);
      setRequisitionId(reqId);
      setConsentState("waiting");
      await WebBrowser.openBrowserAsync(link);
      // After browser closes, user can check status
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function checkConsentStatus() {
    if (!requisitionId) return;
    setConsentState("checking");
    setError(null);
    try {
      const result = await getGoCardlessAccounts(requisitionId);
      if (result.status === "LN" || result.status === "GA") {
        setGcAccounts(result.accounts ?? []);
        goTo("bank-accounts");
      } else if (result.status === "EX") {
        setError(t("consent.expired"));
      } else if (result.status === "RJ") {
        setError(t("consent.rejected"));
      }
      // else still pending
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConsentState("idle");
    }
  }

  async function loadSimpleFinAccounts() {
    setLoading(true);
    setError(null);
    try {
      const result = await getSimpleFinAccounts();
      setSfAccounts(result.accounts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function resolveAccountId(bankName: string): Promise<string> {
    if (mode === "create") {
      const name = bankName || "Linked Account";
      const newId = await createAccount({ name, offbudget }, 0);
      return newId;
    }
    return localAccountId!;
  }

  async function handleLinkGoCardless(account: GoCardlessAccount) {
    setLinking(true);
    try {
      const acctId = await resolveAccountId(account.name ?? account.id);
      await linkAccount(acctId, "goCardless", account.id, institution?.name, requisitionId!);
      // Sync immediately after linking (same as Actual web)
      await syncAccount(acctId).catch(() => {}); // non-blocking — don't fail the link if sync fails
      // liveQuery auto-refreshes accounts
      if (mode === "create") onAccountCreated?.(acctId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLinking(false);
    }
  }

  async function handleLinkSimpleFin(account: SimpleFinAccount) {
    setLinking(true);
    try {
      const acctId = await resolveAccountId(account.name);
      await linkAccount(acctId, "simpleFin", account.id, account.org.name);
      // Sync immediately after linking (same as Actual web)
      await syncAccount(acctId).catch(() => {});
      // liveQuery auto-refreshes accounts
      if (mode === "create") onAccountCreated?.(acctId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLinking(false);
    }
  }

  // Auto-load SimpleFin accounts when reaching that step
  useEffect(() => {
    if (step === "sf-accounts" && sfAccounts.length === 0) loadSimpleFinAccounts();
  }, [step]);

  // ---------------------------------------------------------------------------
  // Step renderers
  // ---------------------------------------------------------------------------

  function renderStep(s: Step): ReactNode {
    switch (s) {
      case "provider":
        return renderProvider();
      case "country":
        return renderCountry();
      case "institution":
        return renderInstitution();
      case "consent":
        return renderConsent();
      case "bank-accounts":
        return renderBankAccounts();
      case "sf-accounts":
        return renderSimpleFinAccounts();
    }
  }

  function renderProvider() {
    return (
      <View style={styles.stepContent}>
        {goCardlessConfigured && (
          <ListItem
            title={t("provider.goCardless")}
            subtitle={t("provider.goCardlessDescription")}
            left={<GoCardlessIcon size={24} />}
            showChevron
            onPress={() => goTo("country")}
          />
        )}
        {simpleFinConfigured && (
          <ListItem
            title={t("provider.simpleFin")}
            subtitle={t("provider.simpleFinDescription")}
            left={<Ionicons name="card-outline" size={24} color={theme.colors.textSecondary} />}
            showChevron
            onPress={() => goTo("sf-accounts")}
          />
        )}
      </View>
    );
  }

  function renderCountry() {
    const filtered = search
      ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
      : COUNTRIES;

    return (
      <View style={styles.flex}>
        <View style={styles.searchWrapper}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t("country.searchPlaceholder")}
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          renderItem={({ item, index }) => (
            <ListItem
              title={item.name}
              showChevron
              showSeparator={index < filtered.length - 1}
              onPress={() => {
                setCountry(item.code);
                loadBanks(item.code);
                goTo("institution");
              }}
            />
          )}
          contentContainerStyle={styles.list}
        />
      </View>
    );
  }

  function renderInstitution() {
    const filtered = search
      ? banks.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
      : banks;

    if (loading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }

    return (
      <View style={styles.flex}>
        <View style={styles.searchWrapper}>
          <SearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t("institution.searchPlaceholder")}
          />
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <ListItem
              title={item.name}
              showChevron
              showSeparator={index < filtered.length - 1}
              onPress={() => {
                setInstitution(item);
                goTo("consent");
              }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="businessOutline"
              title={t("institution.noResults")}
              description={t("institution.noResultsDescription")}
            />
          }
          contentContainerStyle={styles.list}
        />
      </View>
    );
  }

  function renderConsent() {
    const isChecking = consentState === "checking" || loading;
    return (
      <View style={styles.consentContainer}>
        <View style={styles.consentContent}>
          <Ionicons name="shield-checkmark-outline" size={64} color={theme.colors.primary} />
          <Text variant="bodyLg" color={theme.colors.textPrimary} style={styles.consentTitle}>
            {institution?.name ?? "Bank"}
          </Text>
          <Text variant="body" color={theme.colors.textSecondary} style={styles.consentDescription}>
            {consentState === "waiting"
              ? t("consent.waitingDescription")
              : t("consent.description")}
          </Text>
          {isChecking && <ActivityIndicator size="large" color={theme.colors.primary} />}
        </View>
        <View style={styles.consentActions}>
          {consentState === "idle" && !requisitionId && (
            <Button
              title={t("consent.openBank")}
              onPress={() => startConsent(institution!)}
              size="lg"
              icon="openOutline"
              loading={loading}
            />
          )}
          {(consentState === "waiting" || (consentState === "idle" && requisitionId)) && (
            <Button
              title={t("consent.checkStatus")}
              onPress={checkConsentStatus}
              size="lg"
              icon="refreshOutline"
            />
          )}
        </View>
      </View>
    );
  }

  function renderBankAccounts() {
    if (linking) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }

    return (
      <View style={styles.flex}>
        <Text variant="body" color={theme.colors.textSecondary} style={styles.stepDescription}>
          {t("accounts.description")}
        </Text>
        <FlatList
          data={gcAccounts}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <ListItem
              title={item.name ?? item.id}
              subtitle={item.iban ?? undefined}
              showChevron
              showSeparator={index < gcAccounts.length - 1}
              onPress={() => handleLinkGoCardless(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="walletOutline"
              title={t("accounts.noAccounts")}
              description={t("accounts.noAccountsDescription")}
            />
          }
          contentContainerStyle={styles.list}
        />
      </View>
    );
  }

  function renderSimpleFinAccounts() {
    if (loading || linking) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }

    return (
      <View style={styles.flex}>
        <Text variant="body" color={theme.colors.textSecondary} style={styles.stepDescription}>
          {t("simplefin.description")}
        </Text>
        <FlatList
          data={sfAccounts}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <ListItem
              title={item.name}
              subtitle={`${item.org.name} · ${formatBalance(item.balance)}`}
              showChevron
              showSeparator={index < sfAccounts.length - 1}
              onPress={() => handleLinkSimpleFin(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="walletOutline"
              title={t("accounts.noAccounts")}
              description={t("accounts.noAccountsDescription")}
            />
          }
          contentContainerStyle={styles.list}
        />
      </View>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const showBack = step !== initialStep;

  return (
    <WizardShell
      stepNumber={Math.max(stepIndex + 1, 1)}
      totalSteps={activeSteps.length}
      onClose={onClose}
      onBack={showBack ? handleBack : null}
      prevContent={prevStep != null ? renderStep(prevStep) : null}
      inTarget={transition.inTarget}
      outTarget={transition.outTarget}
      shouldAnimate={transition.shouldAnimate}
      onTransitionEnd={transition.handleTransitionEnd}
    >
      {error && (
        <View style={styles.errorWrapper}>
          <Banner message={error} variant="error" onDismiss={() => setError(null)} />
        </View>
      )}
      {renderStep(step)}
    </WizardShell>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (theme: Theme) => ({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const },
  stepContent: { padding: theme.spacing.xl, gap: theme.spacing.md },
  stepDescription: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.md },
  searchWrapper: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: 80 },
  errorWrapper: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.sm },
  consentContainer: { flex: 1, padding: theme.spacing.xl },
  consentContent: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: theme.spacing.sm,
  },
  consentTitle: { fontWeight: "600" as const, textAlign: "center" as const },
  consentDescription: { textAlign: "center" as const },
  consentActions: { paddingBottom: theme.spacing.xl },
});
