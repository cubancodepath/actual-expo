# recurrence-fns

Recurrence engine with an [rschedule](https://gitlab.com/john.carroll.p/rschedule)-shaped API,
implemented on [date-fns](https://date-fns.org/). Runs on Hermes / React Native.

## What this is not

Not a fork of rschedule, and not a drop-in replacement for it. It implements the exact subset of
`@rschedule/core`'s API that Actual Budget uses, with the same semantics, verified case by case
against rschedule 1.5.0.

## Why it exists

`@rschedule/core` doesn't load under Hermes — the dynamic import of its date-adapter setup fails —
which left every recurring-date feature dead in Actual's React Native port. Rewriting the engine
behind a different API would have meant diverging from upstream's `loot-core` forever.
recurrence-fns keeps the shape of the call so application code stays identical to upstream.

## Usage

```ts
import { Schedule } from "recurrence-fns";

// Endless series — nothing is computed until you take from it.
const monthly = new Schedule({
  rrules: [{ frequency: "MONTHLY", start: new Date(2026, 0, 15, 12), byHourOfDay: [12] }],
});
monthly.occurrences({ take: 3 }).toArray(); // Jan 15, Feb 15, Mar 15

// Bounded range.
monthly.occurrences({ start: new Date(2026, 5, 1), end: new Date(2026, 8, 1) }).toArray();

// Two rules merged into one ascending series, shared instants collapsed.
new Schedule({
  rrules: [
    { frequency: "MONTHLY", start, byDayOfMonth: [1, -1] },
    { frequency: "MONTHLY", start, byDayOfWeek: [["FR", -1]] },
  ],
})
  .occurrences({ take: 10 })
  .toArray();
```

## Scope — implemented

- Rule options: `start`, `frequency` (`DAILY` | `WEEKLY` | `MONTHLY` | `YEARLY`), `interval`,
  `count`, `end`, `byHourOfDay`, `byDayOfMonth` (negatives count back from the end),
  `byDayOfWeek` (nth weekday, negative positions allowed). The last two are `MONTHLY` only.
- `Schedule`: several rrules merged into one ascending series, duplicate instants collapsed.
  `count` and `end` apply **per rule**, not to the merged series.
- `occurrences({ start, end, take, reverse }).toArray()`, and the stream is iterable directly.
- `occursOn({ date })` — exact-instant match.
- `occursBetween(start, end)` — inclusive on both ends.
- `data` — an opaque payload carried through, never interpreted.

## Out of scope

These will not be added; the whole point is a surface small enough to keep correct.

- `exrules`, `EXDATE`, `RDATE`, the `Dates` collection
- Composition operators: `add`, `subtract`, `intersection`, `unique`, `merge`
- `Calendar`, a public `OccurrenceGenerator`, a standalone `Rule` class
- `BYSETPOS`, `BYMONTH`, `BYYEARDAY`, `BYWEEKNO`, `WKST`
- `byDayOfMonth` / `byDayOfWeek` on frequencies other than `MONTHLY`
- `byMinuteOfHour`, `bySecondOfMinute`, `duration`
- Time zones and pluggable date adapters (Luxon, Moment, Dayjs, Joda). Native `Date` with local
  calendar arithmetic only.
- iCal / RRULE string serialisation, JSON tools
- `SECONDLY` / `MINUTELY` / `HOURLY` frequencies

## Deliberate deviations from rschedule

- Draining an endless series with neither `take` nor `end` throws
  `RecurrenceError('unbounded-drain')` instead of hanging. On Hermes a hang is an ANR; an error is
  diagnosable.
- A hard `MAX_OCCURRENCES` ceiling per drain, and a `MAX_EMPTY_PERIODS` cutoff so a pattern that
  can never resolve terminates rather than spinning.
- Own error messages, except the unbounded-reverse one, which is reproduced verbatim.

## Semantics worth knowing

- `MONTHLY` without `byDayOfMonth` **skips** months that lack the start's day-of-month:
  Jan 31 → Mar 31, never Feb 28. `YEARLY` on Feb 29 only emits in leap years. This is RFC 5545,
  and what rschedule does.
- `count` counts from the origin of the series, never from the `start` of a query.
- `byHourOfDay` sets the hour and preserves minutes and below.

## Provenance & licence

The _shape_ of the API follows rschedule 1.5.0, which is released under the Unlicense (public
domain). No code was copied; the implementation is original, on top of date-fns. recurrence-fns is
MIT licensed.

## Notes for contributors

This package has no access to the host app: it must never import anything from `@/`, and date-fns
is its only dependency. The repo's architecture checks (`scripts/check-arch.sh`) do not scan
`packages/`, so `src/index.ts` is the contract — if it isn't exported there, it's internal.
