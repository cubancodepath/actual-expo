import {
  CalendarClock,
  Flag,
  Gauge,
  History,
  Percent,
  RefreshCw,
  Repeat,
  Split,
  type LucideIcon,
} from "lucide-react-native";
import type { DisplayTemplateType } from "@/core/server/budget/goals";

/**
 * Presentation for each of the nine goal types the editor offers, mirroring
 * the desktop client's `displayTemplateMeta.ts`. Order is the order they're
 * offered in the type picker: the ones that budget money first, the ones that
 * cap or observe it last.
 *
 * Declared `as const` so the i18n keys stay literals — i18next then checks
 * them against `budget.json` instead of accepting any string.
 */
export const displayTypeMeta = {
  fixed: {
    icon: Repeat,
    labelKey: "goals.types.fixed",
    descriptionKey: "goals.descriptions.fixed",
  },
  schedule: {
    icon: CalendarClock,
    labelKey: "goals.types.schedule",
    descriptionKey: "goals.descriptions.schedule",
  },
  percentage: {
    icon: Percent,
    labelKey: "goals.types.percentage",
    descriptionKey: "goals.descriptions.percentage",
  },
  historical: {
    icon: History,
    labelKey: "goals.types.historical",
    descriptionKey: "goals.descriptions.historical",
  },
  remainder: {
    icon: Split,
    labelKey: "goals.types.remainder",
    descriptionKey: "goals.descriptions.remainder",
  },
  limit: {
    icon: Gauge,
    labelKey: "goals.types.limit",
    descriptionKey: "goals.descriptions.limit",
  },
  refill: {
    icon: RefreshCw,
    labelKey: "goals.types.refill",
    descriptionKey: "goals.descriptions.refill",
  },
  goal: {
    icon: Flag,
    labelKey: "goals.types.goal",
    descriptionKey: "goals.descriptions.goal",
  },
} as const satisfies Record<
  DisplayTemplateType,
  { icon: LucideIcon; labelKey: string; descriptionKey: string }
>;

/**
 * The type whose amount the user types in. Every date/cadence shape
 * (periodic, simple, by, spend) lives inside its editor as modes.
 */
export const KNOWN_AMOUNT_TYPE_ORDER: DisplayTemplateType[] = ["fixed"];

/** Types whose amount is derived — from a schedule, income, history, leftovers. */
export const CALCULATED_TYPE_ORDER: DisplayTemplateType[] = [
  "schedule",
  "percentage",
  "historical",
  "remainder",
];

/**
 * Types offered in the "Options" section — these cap or observe.
 *
 * `refill` isn't offered: "refill up to X" is the fixed editor's own mode
 * (one row, no cap to pair it with), and the engine runs both the same way.
 * The type still exists to render a stray refill that couldn't be fused with
 * a cap — it just isn't something to reach for.
 */
export const OPTION_TYPE_ORDER: DisplayTemplateType[] = ["limit", "goal"];
