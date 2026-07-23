/**
 * Goal/template module — barrel re-exports.
 *
 * Pure functions (parsing, inference, serialization) live in `./parse`.
 * DB/CRDT persistence functions live in `./persist`.
 * This barrel re-exports both for backward compatibility.
 */

export {
  parseGoalDef,
  inferGoalFromDef,
  templateToNoteLine,
  templatesToNoteText,
  parseTemplateNotes,
  hasLegacyTemplateNotes,
  stripTemplateLines,
} from "../goal-template-parser";
export {
  getGoalTemplates,
  getCategoryNote,
  setGoalTemplates,
  setGoalResult,
} from "../goal-template";
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
export { describeTemplate, translateDescription } from "./describe";
export type { TemplateDescription } from "./describe";
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
