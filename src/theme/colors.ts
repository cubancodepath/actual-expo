// Actual Budget color palette — aligned with actualbudget/actual palette.ts

// ── Base palette ──────────────────────────────────────────────────────────────

export const palette = {
  white: "#ffffff",
  black: "#000000",

  // Grays
  gray50: "#f6f8fa",
  gray80: "#f0f4f6",
  gray100: "#e8ecf0",
  gray150: "#d4dae0",
  gray200: "#bdc5cf",
  gray300: "#98a1ae",
  gray400: "#747c8b",
  gray500: "#4d5768",
  gray600: "#373b4a",
  gray700: "#242733",
  gray800: "#141520",
  gray900: "#080811",

  // Navy (blue-grays — Actual's signature neutral tone)
  navy50: "#f7fafc",
  navy100: "#e8ecf0",
  navy150: "#d9e2ec",
  navy200: "#bcccdc",
  navy300: "#9fb3c8",
  navy400: "#829ab1",
  navy500: "#627d98",
  navy600: "#486581",
  navy700: "#334e68",
  navy800: "#243b53",
  navy900: "#102a43",

  // Blues
  blue50: "#f5fcff",
  blue100: "#e3f0ff",
  blue150: "#b3d9ff",
  blue200: "#8bcafd",
  blue300: "#66b5fa",
  blue400: "#40a5f7",
  blue500: "#2b8fed",
  blue600: "#1980d4",
  blue700: "#1271bf",
  blue800: "#0b5fa3",
  blue900: "#034388",

  // Greens
  green50: "#fafffd",
  green100: "#effcf6",
  green150: "#c6f7e2",
  green200: "#8eedc7",
  green300: "#65d6ad",
  green400: "#3ebd93",
  green500: "#27ab83",
  green600: "#199473",
  green700: "#147d64",
  green800: "#0c6b58",
  green900: "#014d40",

  // Oranges (amber-leaning — Actual's warning/caution palette)
  orange50: "#fffefa",
  orange100: "#fffbea",
  orange150: "#fff7c4",
  orange200: "#fcf088",
  orange300: "#f5e35d",
  orange400: "#f2d047",
  orange500: "#e6bb20",
  orange600: "#d4a31c",
  orange700: "#b88115",
  orange800: "#87540d",
  orange900: "#733309",

  // Reds
  red50: "#fff1f1",
  red100: "#ffe3e3",
  red150: "#ffbdbd",
  red200: "#ff9b9b",
  red300: "#f86a6a",
  red400: "#ef4e4e",
  red500: "#e12d39",
  red600: "#cf1124",
  red700: "#ab091e",
  red800: "#8a041a",
  red900: "#610316",

  // Purples (brand accent — #8719e0 is THE brand color)
  purple50: "#f9f6fe",
  purple100: "#f2ebfe",
  purple125: "#e4d4ff",
  purple150: "#dac4ff",
  purple200: "#b990ff",
  purple300: "#a368fc",
  purple400: "#9446ed",
  purple500: "#8719e0",
  purple600: "#7a0ecc",
  purple700: "#690cb0",
  purple800: "#580a94",
  purple900: "#44056e",

  // ── Modern vibrant accents (for semantic tokens) ────────────────────────────
  // Inspired by Copilot Money, Robinhood, iOS system colors, Tailwind
  emerald600: "#059669", // light-mode positive text (4.6:1 on white ✓)
  emerald700: "#047857", // positive fill bg (5.48:1 white-on ✓)
  emerald400: "#34D399", // dark-mode positive (vibrant mint)
  twGreen600: "#16a34a", // vivid positive text light (4.5:1 on white ✓)
  twGreen400: "#4ade80", // vivid positive text dark
  rose600: "#E11D48", // light-mode negative text (5.2:1 on white ✓)
  rose700: "#9F1239", // negative fill bg (8.0:1 white-on ✓) — matches emerald700 depth
  rose400: "#FB7185", // dark-mode negative (vibrant coral)
  amber600: "#D97706", // light-mode warning text (4.6:1 on white ✓)
  amber700: "#B45309", // warning fill bg (5.02:1 white-on ✓)
  amber400: "#FBBF24", // dark-mode warning (vibrant gold)

  // Chart categorical (vibrant modern palette)
  chart1: "#8719E0", // purple (brand)
  chart2: "#0EA5E9", // sky blue
  chart3: "#10B981", // emerald
  chart4: "#F59E0B", // amber
  chart5: "#EC4899", // pink
  chart6: "#06B6D4", // cyan
  chart7: "#F97316", // orange
  chart8: "#8B5CF6", // violet
  chart9: "#14B8A6", // teal
} as const;

// ── Semantic theme tokens ─────────────────────────────────────────────────────

export interface ThemeColors {
  // Surfaces (3-tier elevation)
  pageBackground: string;
  cardBackground: string;
  elevatedBackground: string;
  cardBorder: string;
  modalBackground: string;
  modalOverlay: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Brand / Primary
  primary: string;
  primaryHover: string;
  primaryText: string;
  primarySubtle: string;
  primaryMuted: string;

  // Semantic (amounts, indicators)
  positive: string;
  positiveVivid: string;
  negative: string;
  warning: string;
  link: string;

  // Tinted backgrounds for positive/negative/warning contexts
  positiveSubtle: string;
  negativeSubtle: string;
  warningSubtle: string;

  // Solid fill backgrounds for white text (WCAG AA ≥ 4.5:1)
  primaryFill: string;
  positiveFill: string;
  negativeFill: string;
  warningFill: string;

  // Budget health (3-tier: healthy / caution / overspent)
  budgetHealthy: string;
  budgetHealthyBg: string;
  budgetCaution: string;
  budgetCautionBg: string;
  budgetOverspent: string;
  budgetOverspentBg: string;

  // Navigation
  headerBackground: string;
  headerText: string;
  navBackground: string;
  navBorder: string;
  navItemInactive: string;
  navItemActive: string;

  // Interactive
  inputBackground: string;
  inputBorder: string;
  inputFocusBorder: string;
  buttonSecondaryBackground: string;
  buttonSecondaryText: string;
  buttonDangerBackground: string;
  buttonDangerText: string;

  // Status (banners, badges)
  successBackground: string;
  successText: string;
  warningBackground: string;
  warningText: string;
  errorBackground: string;
  errorText: string;

  // Charts
  chart: string[];

  // Toast
  toastBackground: string;

  // Vibrant colors (modern, high-contrast — for native UI components)
  vibrantPositive: string;
  vibrantNegative: string;
  vibrantWarning: string;
  vibrantPositiveBg: string;
  vibrantNegativeBg: string;
  vibrantWarningBg: string;
  vibrantPillText: string;
  vibrantPillTextNegative: string;

  // Misc
  divider: string;
  skeleton: string;
  shadow: string;
  progressTrack: string;
}

export const lightColors: ThemeColors = {
  // Surfaces
  pageBackground: palette.navy50,
  cardBackground: palette.white,
  elevatedBackground: palette.white,
  cardBorder: palette.navy100,
  modalBackground: palette.white,
  modalOverlay: "rgba(0, 0, 0, 0.4)",

  // Text
  textPrimary: "#272630",
  textSecondary: palette.gray500,
  textMuted: palette.gray400,

  // Brand
  primary: palette.purple500,
  primaryHover: palette.purple600,
  primaryText: palette.white,
  primarySubtle: "rgba(135, 25, 224, 0.14)",
  primaryMuted: palette.purple200,

  // Semantic (vibrant modern — emerald/rose/amber)
  positive: palette.emerald600,
  positiveVivid: palette.twGreen600,
  negative: palette.rose600,
  warning: palette.amber600,
  link: palette.blue600,

  // Tinted backgrounds
  positiveSubtle: "rgba(5, 150, 105, 0.12)",
  negativeSubtle: "rgba(225, 29, 72, 0.10)",
  warningSubtle: "rgba(217, 119, 6, 0.10)",

  // Solid fills for white text
  primaryFill: palette.purple400,
  positiveFill: palette.emerald700,
  negativeFill: palette.rose700,
  warningFill: palette.amber700,

  // Budget health
  budgetHealthy: palette.emerald600,
  budgetHealthyBg: "rgba(5, 150, 105, 0.14)",
  budgetCaution: palette.amber600,
  budgetCautionBg: "rgba(217, 119, 6, 0.12)",
  budgetOverspent: palette.rose600,
  budgetOverspentBg: "rgba(225, 29, 72, 0.12)",

  // Navigation (modern: neutral header instead of solid purple)
  headerBackground: palette.navy50,
  headerText: "#272630",
  navBackground: palette.white,
  navBorder: palette.navy100,
  navItemInactive: palette.gray300,
  navItemActive: palette.purple500,

  // Interactive
  inputBackground: palette.white,
  inputBorder: palette.navy200,
  inputFocusBorder: palette.purple500,
  buttonSecondaryBackground: palette.gray100,
  buttonSecondaryText: palette.gray600,
  buttonDangerBackground: palette.gray100,
  buttonDangerText: palette.rose600,

  // Status
  successBackground: "rgba(5, 150, 105, 0.16)",
  successText: palette.emerald600,
  warningBackground: "rgba(217, 119, 6, 0.16)",
  warningText: palette.amber600,
  errorBackground: "rgba(225, 29, 72, 0.14)",
  errorText: palette.rose600,

  // Charts (vibrant modern palette)
  chart: [
    palette.chart1,
    palette.chart2,
    palette.chart3,
    palette.chart4,
    palette.chart5,
    palette.chart6,
    palette.chart7,
    palette.chart8,
    palette.chart9,
  ],

  // Toast
  toastBackground: palette.gray800,

  // Misc
  divider: palette.navy100,
  skeleton: palette.navy100,
  shadow: "rgba(0, 0, 0, 0.12)",
  progressTrack: palette.navy100,

  // Vibrant
  vibrantPositive: "#AFE966",
  vibrantNegative: "#F87171",
  vibrantWarning: "#FBBF24",
  vibrantPositiveBg: "rgba(74, 222, 128, 0.15)",
  vibrantNegativeBg: "rgba(248, 113, 113, 0.12)",
  vibrantWarningBg: "rgba(251, 191, 36, 0.12)",
  vibrantPillText: "#1A1A2E",
  vibrantPillTextNegative: "#450A0A",
};

export const darkColors: ThemeColors = {
  // Surfaces (deeper blacks for premium feel, matching original)
  pageBackground: palette.gray900,
  cardBackground: palette.gray800,
  elevatedBackground: palette.gray700,
  cardBorder: "rgba(255, 255, 255, 0.08)",
  modalBackground: palette.gray800,
  modalOverlay: "rgba(0, 0, 0, 0.65)",

  // Text
  textPrimary: palette.navy150,
  textSecondary: palette.gray300,
  textMuted: palette.gray400,

  // Brand
  primary: palette.purple400,
  primaryHover: palette.purple500,
  primaryText: palette.white,
  primarySubtle: "rgba(148, 70, 237, 0.25)",
  primaryMuted: palette.purple700,

  // Semantic (vibrant modern — bright on dark)
  positive: palette.emerald400,
  positiveVivid: palette.twGreen400,
  negative: palette.rose400,
  warning: palette.amber400,
  link: palette.purple300,

  // Tinted backgrounds
  positiveSubtle: "rgba(52, 211, 153, 0.16)",
  negativeSubtle: "rgba(251, 113, 133, 0.16)",
  warningSubtle: "rgba(251, 191, 36, 0.14)",

  // Solid fills for white text (same as light — these are dark enough)
  primaryFill: palette.purple600,
  positiveFill: palette.emerald700,
  negativeFill: palette.rose700,
  warningFill: palette.amber700,

  // Budget health
  budgetHealthy: palette.emerald400,
  budgetHealthyBg: "rgba(52, 211, 153, 0.18)",
  budgetCaution: palette.amber400,
  budgetCautionBg: "rgba(251, 191, 36, 0.16)",
  budgetOverspent: palette.rose400,
  budgetOverspentBg: "rgba(251, 113, 133, 0.18)",

  // Navigation (seamless with page bg)
  headerBackground: palette.gray900,
  headerText: palette.navy150,
  navBackground: palette.gray900,
  navBorder: "rgba(255, 255, 255, 0.06)",
  navItemInactive: palette.gray400,
  navItemActive: palette.purple400,

  // Interactive
  inputBackground: palette.gray700,
  inputBorder: palette.gray600,
  inputFocusBorder: palette.purple400,
  buttonSecondaryBackground: palette.gray700,
  buttonSecondaryText: palette.gray200,
  buttonDangerBackground: palette.gray700,
  buttonDangerText: palette.rose400,

  // Status
  successBackground: "rgba(52, 211, 153, 0.25)",
  successText: palette.emerald400,
  warningBackground: "rgba(251, 191, 36, 0.22)",
  warningText: palette.amber400,
  errorBackground: "rgba(251, 113, 133, 0.22)",
  errorText: palette.rose400,

  // Charts (vibrant modern palette)
  chart: [
    palette.chart1,
    palette.chart2,
    palette.chart3,
    palette.chart4,
    palette.chart5,
    palette.chart6,
    palette.chart7,
    palette.chart8,
    palette.chart9,
  ],

  // Toast
  toastBackground: palette.gray700,

  // Misc
  divider: "rgba(255, 255, 255, 0.06)",
  skeleton: palette.gray700,
  shadow: "rgba(0, 0, 0, 0.4)",
  progressTrack: "rgba(255, 255, 255, 0.06)",

  // Vibrant
  vibrantPositive: "#22C55E",
  vibrantNegative: "#EF4444",
  vibrantWarning: "#F59E0B",
  vibrantPositiveBg: "rgba(34, 197, 94, 0.20)",
  vibrantNegativeBg: "rgba(239, 68, 68, 0.20)",
  vibrantWarningBg: "rgba(245, 158, 11, 0.20)",
  vibrantPillText: "#080811",
  vibrantPillTextNegative: "#FFFFFF",
};
