import type { Ionicons } from "@expo/vector-icons";
import type { SFSymbol } from "sf-symbols-typescript";

type IconEntry = {
  ionicon: keyof typeof Ionicons.glyphMap;
  sfSymbol: SFSymbol;
};

export const iconRegistry = {
  // Navigation
  chevronBack: { ionicon: "chevron-back", sfSymbol: "chevron.left" },
  chevronBackOutline: { ionicon: "chevron-back-outline", sfSymbol: "chevron.left" },
  chevronForward: { ionicon: "chevron-forward", sfSymbol: "chevron.right" },
  chevronDown: { ionicon: "chevron-down", sfSymbol: "chevron.down" },
  chevronUp: { ionicon: "chevron-up", sfSymbol: "chevron.up" },
  arrowForwardOutline: { ionicon: "arrow-forward-outline", sfSymbol: "arrow.right" },
  arrowUp: { ionicon: "arrow-up", sfSymbol: "arrow.up" },

  // Actions
  add: { ionicon: "add", sfSymbol: "plus" },
  addCircle: { ionicon: "add-circle", sfSymbol: "plus.circle.fill" },
  addCircleOutline: { ionicon: "add-circle-outline", sfSymbol: "plus.circle" },
  close: { ionicon: "close", sfSymbol: "xmark" },
  closeCircle: { ionicon: "close-circle", sfSymbol: "xmark.circle.fill" },
  search: { ionicon: "search", sfSymbol: "magnifyingglass" },
  refresh: { ionicon: "refresh", sfSymbol: "arrow.clockwise" },
  trash: { ionicon: "trash", sfSymbol: "trash" },
  trashOutline: { ionicon: "trash-outline", sfSymbol: "trash" },
  syncOutline: { ionicon: "sync-outline", sfSymbol: "arrow.triangle.2.circlepath" },
  cloudDownloadOutline: { ionicon: "cloud-download-outline", sfSymbol: "icloud.and.arrow.down" },
  linkOutline: { ionicon: "link-outline", sfSymbol: "link" },
  ellipsisHorizontal: { ionicon: "ellipsis-horizontal", sfSymbol: "ellipsis" },
  ellipsisHorizontalCircleOutline: {
    ionicon: "ellipsis-horizontal-circle-outline",
    sfSymbol: "ellipsis.circle",
  },

  // Status
  checkmark: { ionicon: "checkmark", sfSymbol: "checkmark" },
  checkmarkCircle: { ionicon: "checkmark-circle", sfSymbol: "checkmark.circle.fill" },
  checkmarkCircleOutline: { ionicon: "checkmark-circle-outline", sfSymbol: "checkmark.circle" },
  alertCircle: { ionicon: "alert-circle", sfSymbol: "exclamationmark.circle.fill" },
  alertCircleOutline: { ionicon: "alert-circle-outline", sfSymbol: "exclamationmark.circle" },
  informationCircle: { ionicon: "information-circle", sfSymbol: "info.circle" },
  warning: { ionicon: "warning", sfSymbol: "exclamationmark.triangle.fill" },
  warningOutline: { ionicon: "warning-outline", sfSymbol: "exclamationmark.triangle" },
  helpCircleOutline: { ionicon: "help-circle-outline", sfSymbol: "questionmark.circle" },
  ellipseOutline: { ionicon: "ellipse-outline", sfSymbol: "circle" },
  flagOutline: { ionicon: "flag-outline", sfSymbol: "flag" },
  shieldCheckmarkOutline: { ionicon: "shield-checkmark-outline", sfSymbol: "checkmark.shield" },
  lockShieldOutline: { ionicon: "shield-checkmark-outline", sfSymbol: "lock.shield" },

  // Finance / Domain
  cashOutline: { ionicon: "cash-outline", sfSymbol: "dollarsign" },
  wallet: { ionicon: "wallet-outline", sfSymbol: "creditcard" },
  lockClosed: { ionicon: "lock-closed", sfSymbol: "lock.fill" },
  lockClosedOutline: { ionicon: "lock-closed-outline", sfSymbol: "lock" },
  lockOpen: { ionicon: "lock-open", sfSymbol: "lock.open" },
  swapHorizontal: { ionicon: "swap-horizontal", sfSymbol: "arrow.right.arrow.left" },
  barChartOutline: { ionicon: "bar-chart-outline", sfSymbol: "chart.bar" },

  // Content
  folderOutline: { ionicon: "folder-outline", sfSymbol: "folder" },
  folder: { ionicon: "folder", sfSymbol: "folder.fill" },
  folderOpenOutline: { ionicon: "folder-open-outline", sfSymbol: "folder.badge.minus" },
  documentTextOutline: { ionicon: "document-text-outline", sfSymbol: "doc.text" },
  documentText: { ionicon: "document-text", sfSymbol: "doc.text.fill" },
  document: { ionicon: "document", sfSymbol: "doc" },
  documentOutline: { ionicon: "document-outline", sfSymbol: "doc" },
  calendarOutline: { ionicon: "calendar-outline", sfSymbol: "calendar" },
  personOutline: { ionicon: "person-outline", sfSymbol: "person" },
  peopleOutline: { ionicon: "people-outline", sfSymbol: "person.2" },
  pricetagsOutline: { ionicon: "pricetags-outline", sfSymbol: "tag" },
  gitBranchOutline: { ionicon: "git-branch-outline", sfSymbol: "arrow.triangle.branch" },
  layersOutline: { ionicon: "layers-outline", sfSymbol: "square.3.layers.3d" },
  globeOutline: { ionicon: "globe-outline", sfSymbol: "globe" },
  serverOutline: { ionicon: "server-outline", sfSymbol: "server.rack" },
  settingsOutline: { ionicon: "settings-outline", sfSymbol: "gearshape" },
  optionsOutline: { ionicon: "options-outline", sfSymbol: "slider.horizontal.3" },
  phonePortraitOutline: { ionicon: "phone-portrait-outline", sfSymbol: "iphone" },
  colorPaletteOutline: { ionicon: "color-palette-outline", sfSymbol: "paintbrush" },
  codeSlash: { ionicon: "code-slash", sfSymbol: "chevron.left.forwardslash.chevron.right" },

  // Location
  locationOutline: { ionicon: "location-outline", sfSymbol: "location" },

  // Scheduling
  repeat: { ionicon: "repeat", sfSymbol: "repeat" },

  // Media
  playSkipForwardOutline: { ionicon: "play-skip-forward-outline", sfSymbol: "forward.end" },
  playForwardOutline: { ionicon: "play-forward-outline", sfSymbol: "forward" },

  // Input
  deleteBackward: { ionicon: "backspace-outline", sfSymbol: "delete.backward" },
  pencilOutline: { ionicon: "pencil-outline", sfSymbol: "pencil" },
  textOutline: { ionicon: "text-outline", sfSymbol: "text.alignleft" },

  // Visibility
  eyeOutline: { ionicon: "eye-outline", sfSymbol: "eye" },
  eyeOffOutline: { ionicon: "eye-off-outline", sfSymbol: "eye.slash" },

  // Rating
  star: { ionicon: "star", sfSymbol: "star.fill" },

  // Misc
  receiptOutline: { ionicon: "receipt-outline", sfSymbol: "doc.plaintext" },
  searchOutline: { ionicon: "search-outline", sfSymbol: "magnifyingglass" },
  sparkles: { ionicon: "sparkles", sfSymbol: "sparkles" },
  reorderThreeOutline: { ionicon: "reorder-three-outline", sfSymbol: "line.3.horizontal" },
  funnelOutline: { ionicon: "funnel-outline", sfSymbol: "line.3.horizontal.decrease" },
  arrowUndoOutline: { ionicon: "arrow-undo-outline", sfSymbol: "arrow.uturn.backward" },
  logOutOutline: { ionicon: "log-out-outline", sfSymbol: "rectangle.portrait.and.arrow.right" },
  cloudUploadOutline: { ionicon: "cloud-upload-outline", sfSymbol: "icloud.and.arrow.up" },

  // Debug
  bugOutline: { ionicon: "bug-outline", sfSymbol: "ant" },

  // Calculator
  plus: { ionicon: "add", sfSymbol: "plus" },
  minus: { ionicon: "remove", sfSymbol: "minus" },
  multiply: { ionicon: "close", sfSymbol: "multiply" },
  divide: { ionicon: "code-slash", sfSymbol: "divide" },
} as const satisfies Record<string, IconEntry>;

export type IconName = keyof typeof iconRegistry;
