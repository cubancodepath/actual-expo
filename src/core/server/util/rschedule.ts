/**
 * Mirror of loot-core/src/server/util/rschedule.ts.
 *
 * Upstream re-exports @rschedule/*; here the engine is `recurrence-fns`, a
 * Hermes-safe reimplementation of the same API shape on top of date-fns
 * (rschedule itself does not load under Hermes). This is the ONLY file in
 * src/core/ that names the package, so every other import stays identical to
 * upstream and swapping the engine again means editing this file alone.
 */
import { Schedule as OriginalSchedule } from "recurrence-fns";

export * from "recurrence-fns";

export class RSchedule<TData = unknown> extends OriginalSchedule<TData> {}
