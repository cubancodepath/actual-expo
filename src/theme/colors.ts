// Actual Budget color palette — sourced from actualbudget/actual palette.ts

// ── Base palette ──────────────────────────────────────────────────────────────

export const palette = {
  white: "#ffffff",
  black: "#000000",

  gray50: "#f6f8fa",
  gray100: "#e8edf2",
  gray150: "#d3dae3",
  gray200: "#b7c1ce",
  gray300: "#98a1ae",
  gray400: "#6e7a8a",
  gray500: "#4e5a6a",
  gray600: "#3b4554",
  gray700: "#2a3242",
  gray800: "#1e1e22",
  gray900: "#131316",

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

  blue50: "#f5fcff",
  blue100: "#e0f3ff",
  blue150: "#bae4ff",
  blue200: "#7cc4fa",
  blue300: "#47a3f3",
  blue400: "#2186eb",
  blue500: "#0b69d4",
  blue600: "#1980d4",
  blue700: "#0552b5",
  blue800: "#0b5fa3",
  blue900: "#034388",

  green50: "#fafffd",
  green100: "#e6fffa",
  green150: "#c6f7e2",
  green200: "#8eedc7",
  green300: "#65d6ad",
  green400: "#3ebd93",
  green500: "#27ab83",
  green600: "#199473",
  green700: "#147d64",
  green800: "#0c6b58",
  green900: "#014d40",

  orange50: "#fffefa",
  orange100: "#ffefd6",
  orange150: "#ffdda9",
  orange200: "#ffbd71",
  orange300: "#f59b42",
  orange400: "#de7818",
  orange500: "#b35e0a",
  orange600: "#8f4a09",
  orange700: "#79400a",
  orange800: "#5f3308",
  orange900: "#733309",

  red50: "#fff1f1",
  red100: "#ffe0e0",
  red150: "#ffb8b8",
  red200: "#ff8c8c",
  red300: "#f86a6a",
  red400: "#ef4e4e",
  red500: "#e12d39",
  red600: "#cf1124",
  red700: "#ab091e",
  red800: "#8a041a",
  red900: "#610316",

  purple50: "#f9f6fe",
  purple100: "#f0e5fc",
  purple150: "#e0c6f7",
  purple200: "#cb9cf2",
  purple300: "#b57bee",
  purple400: "#9446ed",
  purple500: "#8719e0",
  purple600: "#7a0ecc",
  purple700: "#6b0fb5",
  purple800: "#580d94",
  purple900: "#44056e",
} as const;

// ── Semantic theme tokens ─────────────────────────────────────────────────────

export interface ThemeColors {
  // Surfaces
  pageBackground: string;
  cardBackground: string;
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

  // Semantic
  positive: string;
  negative: string;
  warning: string;
  link: string;

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

  // Status
  successBackground: string;
  successText: string;
  warningBackground: string;
  warningText: string;
  errorBackground: string;
  errorText: string;

  // Misc
  divider: string;
  skeleton: string;
  shadow: string;
}

export const lightColors: ThemeColors = {
  // Surfaces
  pageBackground: palette.navy50,
  cardBackground: palette.white,
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

  // Semantic
  positive: palette.green700,
  negative: palette.red500,
  warning: palette.orange500,
  link: palette.blue600,

  // Navigation
  headerBackground: palette.purple400,
  headerText: palette.navy50,
  navBackground: palette.white,
  navBorder: palette.navy100,
  navItemInactive: palette.gray300,
  navItemActive: palette.purple500,

  // Interactive
  inputBackground: palette.white,
  inputBorder: palette.navy200,
  inputFocusBorder: palette.purple500,
  buttonSecondaryBackground: palette.gray50,
  buttonSecondaryText: palette.gray600,
  buttonDangerBackground: palette.red100,
  buttonDangerText: palette.red700,

  // Status
  successBackground: palette.green100,
  successText: palette.green800,
  warningBackground: palette.orange100,
  warningText: palette.orange800,
  errorBackground: palette.red100,
  errorText: palette.red700,

  // Misc
  divider: palette.navy100,
  skeleton: palette.navy100,
  shadow: "rgba(0, 0, 0, 0.12)",
};

export const darkColors: ThemeColors = {
  // Surfaces
  pageBackground: palette.gray900,
  cardBackground: palette.gray800,
  cardBorder: palette.gray700,
  modalBackground: palette.gray800,
  modalOverlay: "rgba(0, 0, 0, 0.6)",

  // Text
  textPrimary: palette.navy150,
  textSecondary: palette.gray300,
  textMuted: palette.gray400,

  // Brand
  primary: palette.purple400,
  primaryHover: palette.purple500,
  primaryText: palette.white,

  // Semantic
  positive: palette.green400,
  negative: palette.red400,
  warning: palette.orange300,
  link: palette.purple300,

  // Navigation
  headerBackground: palette.gray900,
  headerText: palette.navy150,
  navBackground: palette.gray900,
  navBorder: palette.gray700,
  navItemInactive: palette.gray400,
  navItemActive: palette.purple400,

  // Interactive
  inputBackground: palette.gray700,
  inputBorder: palette.gray600,
  inputFocusBorder: palette.purple400,
  buttonSecondaryBackground: palette.gray700,
  buttonSecondaryText: palette.gray200,
  buttonDangerBackground: palette.red900,
  buttonDangerText: palette.red200,

  // Status
  successBackground: palette.green900,
  successText: palette.green200,
  warningBackground: palette.orange900,
  warningText: palette.orange200,
  errorBackground: palette.red900,
  errorText: palette.red200,

  // Misc
  divider: palette.gray700,
  skeleton: palette.gray700,
  shadow: "rgba(0, 0, 0, 0.4)",
};
