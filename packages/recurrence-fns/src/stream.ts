import { RecurrenceError } from "./errors";
import { MAX_OCCURRENCES } from "./internal/constants";
import { mergeAscending, mergeDescending } from "./merge";
import type { Rule } from "./rule";
import type { IOccurrence, IOccurrenceArgs, IOccurrenceStream } from "./types";

/**
 * A lazy view over a Schedule's occurrences. Nothing is computed until the
 * stream is iterated or `toArray()` is called, so `take: 1` on an endless
 * series evaluates a single period — the hot path when recomputing next dates.
 */
export class OccurrenceStream implements IOccurrenceStream {
  constructor(
    private readonly rules: Rule[],
    private readonly args: IOccurrenceArgs,
  ) {}

  *[Symbol.iterator](): Iterator<IOccurrence> {
    const { start, end, take, reverse } = this.args;
    if (take != null && take <= 0) return;

    if (!reverse && take == null && end == null && this.rules.some((r) => !r.isBounded)) {
      // rschedule would spin forever here. On Hermes that is an ANR, and no
      // caller wants it, so it is a diagnosable error instead.
      throw new RecurrenceError(
        "unbounded-drain",
        "Draining an endless series requires `take` or `end`.",
      );
    }

    const merged = reverse
      ? mergeDescending(this.rules.map((rule) => rule.backward(end)))
      : mergeAscending(this.rules.map((rule) => rule.forward()));

    let emitted = 0;
    for (const date of merged) {
      if (reverse) {
        if (end && date > end) continue;
        if (start && date < start) return;
      } else {
        if (start && date < start) continue;
        if (end && date > end) return;
      }

      yield { date };

      if (++emitted === take) return;
      if (emitted >= MAX_OCCURRENCES) {
        throw new RecurrenceError("iteration-limit", `Exceeded ${MAX_OCCURRENCES} occurrences`);
      }
    }
  }

  toArray(): IOccurrence[] {
    return [...this];
  }
}
