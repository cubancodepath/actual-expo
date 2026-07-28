/**
 * Architecture guardrail — enforces the dependency direction from ARCHITECTURE.md:
 *
 *   app → screens → (ui | stores | lib) → core
 *
 * Replaces the old scripts/check-arch.sh: same rules, but resolved against the
 * real module graph (tsconfig `paths` included) instead of grepping for import
 * strings, so dynamic `import()` and re-exports count too.
 *
 * Run: `npm run check:arch`. Wired into husky pre-commit.
 */

/** Files that were already importing legacy layers when the freeze went in.
 *  Listed exactly, one per file — a broad glob here would let NEW debt in
 *  alongside the old, which is how `@/lib/number` slipped past the previous
 *  guardrail. REMOVE entries as they migrate; never add. */
const LEGACY_GRANDFATHERED = [
  "^src/ui/feedback/ErrorBoundary\\.tsx$",
  "^src/screens/budget/components/BudgetListSkeleton\\.tsx$",
  "^src/hooks/useSharedAmountInput\\.ts$",
  "^src/hooks/useCursorBlink\\.tsx$",
  "^app/_layout\\.tsx$",
  // Keeps `useTheme` ONLY to hold `schedules` on the legacy page colour until
  // that screen migrates off StyleSheet. Drop with the exception there.
  "^app/\\(auth\\)/_layout\\.tsx$",
  "^app/\\(auth\\)/schedule/new\\.tsx$",
  "^app/\\(auth\\)/schedule/recurrence-custom\\.tsx$",
  "^app/\\(auth\\)/schedule/recurrence\\.tsx$",
  "^app/\\(auth\\)/schedules\\.tsx$",
  "^app/\\(auth\\)/settings/payees\\.tsx$",
  "^app/\\(auth\\)/settings/rules\\.tsx$",
  // Same as `(auth)/_layout.tsx`: `useTheme` only pins the legacy `tags` sheet.
  "^app/\\(auth\\)/transaction/_layout\\.tsx$",
  "^app/\\(auth\\)/transaction/account-picker\\.tsx$",
  "^app/\\(auth\\)/transaction/split-category-picker\\.tsx$",
  "^app/\\(auth\\)/transaction/split\\.tsx$",
  "^app/\\(auth\\)/transaction/tags\\.tsx$",
  "^app/\\(public\\)/onboarding\\.tsx$",
];

/** Stores allowed to reach sideways: read-only composition + the persistence adapter. */
const STORE_EXEMPT = "^src/stores/(session\\.selectors|prefsStorage)\\.ts$";

module.exports = {
  forbidden: [
    {
      name: "core-no-ui",
      severity: "error",
      comment:
        "core must stay pure logic, testable in Node. Move shared UI to ui/, screen-specific UI to screens/.",
      from: { path: "^src/core", pathNot: "\\.test\\.ts" },
      to: { path: "^src/(screens|ui|features|components|design-system)" },
    },
    {
      name: "core-no-lib",
      severity: "error",
      comment:
        "core is the bottom layer and may never reach up. Pure logic it needs belongs in core/shared (upstream's loot-core/src/shared).",
      from: { path: "^src/core", pathNot: "\\.test\\.ts" },
      to: { path: "^src/lib" },
    },
    {
      name: "core-no-react",
      severity: "error",
      comment:
        "core must run headless. React-query wiring lives in lib/tanstack/; native deps go through core/platform/ seams.",
      from: { path: "^src/core", pathNot: "\\.test\\.ts" },
      to: {
        dependencyTypes: ["npm", "npm-dev", "npm-peer", "npm-optional"],
        path: "^(react|react-native|react-dom|zustand|heroui-native|uniwind|expo-router|@tanstack)(/|$)",
      },
    },
    {
      name: "core-no-stores",
      severity: "warn",
      comment: "Known port compromise — core should own its state (prefs/server-config).",
      from: { path: "^src/core", pathNot: "\\.test\\.ts" },
      to: { path: "^src/stores" },
    },
    {
      name: "ui-no-screens",
      severity: "error",
      comment: "Shared UI must not depend on screens — it stays screen-agnostic.",
      from: { path: "^src/ui" },
      to: { path: "^src/(screens|features)" },
    },
    {
      name: "no-src-components",
      severity: "error",
      comment: "src/components/ was emptied into src/ui/ — do not recreate it.",
      from: {},
      to: { path: "^src/components" },
    },
    {
      name: "screens-no-cross-domain",
      severity: "error",
      comment:
        "A screen must not import another domain's screens. Shared code goes to ui/, lib/ or stores/.",
      from: { path: "^src/screens/([^/]+)/" },
      to: { path: "^src/screens/([^/]+)/", pathNot: "^src/screens/$1/" },
    },
    {
      name: "no-new-legacy-imports",
      severity: "error",
      comment:
        "@/features and @/design-system are frozen. Migrate the file to its ARCHITECTURE.md home instead.",
      from: {
        path: "^(src/(ui|screens|lib|hooks|stores)|app)/",
        pathNot: LEGACY_GRANDFATHERED,
      },
      to: { path: "^src/(features|design-system)" },
    },
    {
      name: "stores-no-sibling-stores",
      severity: "error",
      comment:
        "Cross-store orchestration lives in stores/operations/ (thunks). Sibling imports reintroduce the module-init cycles that layer removed.",
      from: { path: "^src/stores/[^/]+\\.ts$", pathNot: STORE_EXEMPT },
      to: { path: "^src/stores/", pathNot: "^src/stores/prefsStorage\\.ts$" },
    },
    {
      name: "no-dynamic-store-imports",
      severity: "error",
      comment:
        "Every `await import('@/stores/...')` used to paper over a module cycle. Break it structurally (event / operation / injected handler), don't hide it.",
      from: { pathNot: "\\.test\\.ts" },
      to: { path: "^src/stores", dependencyTypes: ["dynamic-import"] },
    },
    {
      name: "no-circular",
      severity: "warn",
      comment:
        "Circular dependencies bite at module-init time. Raise to error once the count is back to zero.",
      from: {},
      to: { circular: true },
    },
  ],

  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(node_modules|\\.expo|dist|coverage|android|ios)/" },
    tsConfig: { fileName: "tsconfig.json" },
    // Follow type-only imports too: a type import from core into UI is still a
    // layering violation, and it's how a cycle sneaks back in.
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
  },
};
