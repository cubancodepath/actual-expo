/**
 * Goal editor module — the presentation half of budget templates.
 *
 * Upstream's counterpart is `desktop-client/src/components/budget/goals/`: the
 * engine (`goal-template`, `category-template-context`, the parser) stays in
 * core, and everything that exists to describe, shape or validate a template
 * for a human lives here. Pure `.ts` on purpose — no React, no react-native —
 * so the whole thing keeps running under vitest's node environment.
 *
 * Note what is NOT re-exported: `parseGoalDef` and friends belong to
 * `@/core/server/budget/goal-template-parser`, and persistence to
 * `@/core/server/budget/goal-template`. Import those from core directly; the
 * old barrel passed them through and that indirection is what let core end up
 * depending on the editor.
 */

export {
  displayTemplateTypes,
  createAutomationEntry,
  createDefaultTemplate,
  templatesToEntries,
  entriesToTemplates,
  toDisplayType,
  toPeriodic,
  segmentFromTemplate,
  applySegment,
  hydrateScheduleTemplate,
  amountCentsOf,
  withAmountCents,
  retypeTemplate,
  NON_CONTRIBUTION_TYPES,
  SINGLETON_TYPES,
} from "./automations";
export type {
  AutomationEntry,
  DisplayTemplateType,
  RecurrenceSegment,
  ScheduleRef,
} from "./automations";
export {
  validateAutomation,
  validatePercentageAllocation,
  validateSchedulePriorities,
} from "./validate";
export type { AutomationErrorKind, GlobalConflictKind } from "./validate";
export { describeTemplate } from "./describe";
export type { Translate } from "./describe";
export {
  fixedConfigFromTemplate,
  templateFromFixedConfig,
  isFixedTemplate,
  allowedCustomModes,
  normalizeCustomConfig,
  REPEAT_MAX,
  nextDateForWeekday,
  nextDateForDayOfMonth,
  nextYearMonth,
  defaultYearlyDate,
  weekdayOf,
  dayOfMonthOf,
  monthOf,
} from "./fixedGoal";
export type {
  FixedGoalConfig,
  FixedMode,
  FixedTemplate,
  CustomRepeat,
  RepeatUnit,
} from "./fixedGoal";
