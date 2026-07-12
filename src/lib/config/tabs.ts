import type { ParseKeys } from "i18next";
import {
  ChartColumn,
  Landmark,
  ReceiptText,
  WalletCards,
  type LucideIcon,
} from "lucide-react-native";

/**
 * Single source of truth for the main tab bar, shared by both platform
 * renderers in `app/(auth)/(tabs)/_layout.tsx`:
 *
 * - **iOS** uses the native `NativeTabs`, tinted with SF Symbols (`sf`).
 * - **Android** uses the HeroUI `FloatingTabBar`, drawn with lucide `icon`s.
 *
 * `name` doubles as the Expo Router route-group segment under `app/(auth)/(tabs)/`.
 * `labelKey` is an i18n key resolved with `t()` at render time so labels stay
 * localized (EN + ES).
 */
export interface TabConfig {
  name: string;
  labelKey: ParseKeys;
  /** lucide icon shown by the Android `FloatingTabBar`. */
  icon: LucideIcon;
  /** SF Symbol shown by the iOS `NativeTabs`. */
  sf: string;
  /** Material Symbol fallback for the native tab bar. */
  md: string;
}

export const TABS: readonly TabConfig[] = [
  {
    name: "(budget)",
    labelKey: "tabs.budget",
    icon: WalletCards,
    sf: "wallet.bifold.fill",
    md: "account_balance_wallet",
  },
  {
    name: "(spending)",
    labelKey: "tabs.spending",
    icon: ReceiptText,
    sf: "list.bullet",
    md: "receipt_long",
  },
  {
    name: "(accounts)",
    labelKey: "tabs.accounts",
    icon: Landmark,
    sf: "building.columns",
    md: "account_balance",
  },
  {
    name: "(reports)",
    labelKey: "tabs.reports",
    icon: ChartColumn,
    sf: "chart.bar.xaxis",
    md: "bar_chart",
  },
];
