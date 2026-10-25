# Chronexa

**The modern date and time toolkit for JavaScript and TypeScript.**

Chronexa is an immutable `DateTime` with strict parsing, explicit time-zone and DST handling, `Duration`s that
know the difference between elapsed time and calendar time, half-open `Interval`s, business-day
calendars and a recurrence engine. It has no runtime dependencies and is built on the platform's `Intl`.

> **Status: 0.1.0, pre-release.** The API is coherent and well tested, but it has not had real-world mileage.
> Expect small breaking changes before 1.0. See [Known limitations](#known-limitations).

## Who is it for?

Developers who schedule things, bill by the day, show times across zones, or parse user input and need
the edge cases (DST gaps, February 30, month-end maths) to be **explicit and documented** rather than
accidentally "whatever `Date` does". If you only need `new Date().toISOString()`, you don't need a library.

## Install

```bash
npm install chronexa
```

Requires Node.js ≥ 20 or a modern browser with `Intl.DateTimeFormat` time-zone support and
`Intl.RelativeTimeFormat`. ESM and CommonJS builds and TypeScript declarations are included.

```ts
import { DateTime, Duration, Interval } from "chronexa";
// const { DateTime } = require("chronexa");   // CommonJS works too
```

## Quick start

```ts
import { DateTime, Duration, Interval } from "chronexa";

const now = DateTime.now({ zone: "America/New_York" }); // 2025-03-07T10:30:00.000-05:00

now.add({ days: 7 }).toISODate(); // "2025-03-14"
now.subtract({ months: 1 }).toISODate(); // "2025-02-07"
now.startOf("day").toISO(); // "2025-03-07T00:00:00.000-05:00"
now.endOf("month").toISO(); // "2025-03-31T23:59:59.999-04:00"  (DST starts on the 9th)
now.isAfter(DateTime.fromISO("2025-01-01", { zone: "utc" })); // true

DateTime.tryFromISO("2025-02-30"); // { ok: false, error: ChronexaError: … day 30 does not exist in 2025-02 … }

now.format("EEEE, d MMMM yyyy [at] HH:mm ZZZ", { locale: "en" }); // "Friday, 7 March 2025 at 10:30 EST"
now.toLocaleString({ dateStyle: "full", timeStyle: "short" }, "de"); // "Freitag, 7. März 2025 um 10:30"
now.subtract({ hours: 3 }).toRelative({ locale: "en" }); // "3 hours ago"

Duration.from({ hours: 1, minutes: 90 }).normalize().toISO(); // "PT2H30M"
Interval.after(now, { hours: 1 }).contains(now.add({ hours: 1 })); // false  (intervals are [start, end))
```

Runnable versions live in [`examples/`](examples) (`npx tsx examples/quickstart.ts`).

## Core ideas

Chronexa keeps four things apart, because mixing them up is where date bugs come from:

| Concept                                                  | Chronexa type                      | Example                |
| -------------------------------------------------------- | ---------------------------------- | ---------------------- |
| An **instant** on the global timeline                    | `DateTime` (epoch ms inside)       | `2025-03-09T07:00:00Z` |
| A **local calendar date/time** (wall clock)              | `toObject()`, `DateTimeComponents` | `2025-03-09 02:30`     |
| A **time-zone identifier** (rules that change over time) | `Zone` (`kind: "iana"`)            | `America/New_York`     |
| A **UTC offset** (a constant)                            | `Zone` (`kind: "fixed"`)           | `-05:00`               |

- **Always valid.** There is no "invalid DateTime" object. Factories return a usable value or throw a
  `ChronexaError` with a `code`; the `try*` variants return `{ ok, value | error }` instead.
- **Immutable.** Every operation returns a new object.
- **No silent rollover.** Feb 30 is an error, never March 1 or 2. `add` clamps month ends (documented); `set` does not.
- **Nothing guesses about time zones.** Parsing text without an offset needs a zone (default: the system zone,
  overridable globally with `Settings.defaultZone` or per call). Ambiguous and nonexistent local times follow an
  explicit `disambiguation` policy.
- **Elapsed time ≠ calendar time.** `add({ hours: 24 })` and `add({ days: 1 })` differ across DST changes, by design.

## Creating and reading values

```ts
DateTime.now(); // honours Settings.now (inject a clock in tests)
DateTime.fromMillis(1_700_000_000_000, { zone: "utc" });
DateTime.fromSeconds(1_700_000_000, { zone: "utc" });
DateTime.fromJSDate(new Date(), { zone: "Europe/Paris" });
DateTime.fromObject({ year: 2025, month: 3, day: 9, hour: 9 }, { zone: "America/New_York" });
DateTime.fromISO("2025-03-09T09:00:00+01:00", { zone: "Asia/Tokyo" }); // instant, shown in Tokyo
DateTime.fromISO("2025-03-09T09:00:00+01:00", { setZone: true }); // keeps the +01:00 as a fixed offset
DateTime.fromFormat("9 March 2025 5:30 PM", "d MMMM yyyy h:mm a", { zone: "utc", locale: "en" });
```

`dt.year`, `month` (1–12), `day`, `hour`, `minute`, `second`, `millisecond`, `weekday` (ISO: Mon=1…Sun=7),
`ordinal`, `quarter`, `weekYear`, `weekNumber` (ISO 8601), `daysInMonth`, `isLeapYear`, `offset` (minutes),
`zone`, `isInDST`. Conversion: `toMillis()`, `toSeconds()`, `toJSDate()`, `toISO()`, `toObject()`, `toZone(z)`,
`toUTC()`, `toLocal()`. `JSON.stringify` gives ISO 8601.

## Arithmetic

```ts
const d = DateTime.fromISO("2024-01-31T10:00:00", { zone: "utc" });
d.add({ months: 1 }).toISODate(); // "2024-02-29"  (clamped to month end)
d.add({ months: 1, days: 1, hours: 2 }); // calendar units first, then elapsed units
d.set({ hour: 5 }); // replaces fields; set({ month: 2 }) throws (Jan 31 → Feb 31)
d.startOf("quarter");
d.endOf("week", { weekStart: 7 }); // weeks start Monday unless told otherwise
```

Differences — three different questions, three different methods:

```ts
const a = DateTime.fromISO("2024-01-31T00:00:00", { zone: "utc" });
const b = DateTime.fromISO("2024-03-04T00:00:00", { zone: "utc" });
b.elapsed(a, "hour"); // 792      exact elapsed time (hour/minute/second/millisecond only)
b.diff(a, ["month", "day"]).toObject(); // { months: 1, days: 4 }  whole calendar units, truncated
b.calendarDiff(a, "month"); // 2        calendar boundaries crossed (Jan → Mar)
```

## Parsing and formatting

Parsing is strict and never leans on `Date.parse`. ISO 8601 (calendar, ordinal and week dates, basic and
extended formats, offsets) and custom formats are covered in [docs/parsing.md](docs/parsing.md), including what is
**not** supported (leap seconds, fractional hours/minutes, lenient formats).

```ts
DateTime.fromISO("2024-W10-6", { zone: "utc" }).toISODate(); // "2024-03-09"
DateTime.fromISO("20240309T102030Z", { zone: "utc" }).toISO({
  format: "basic",
  suppressMilliseconds: true,
}); // "20240309T102030Z"
DateTime.fromFormat("09/03/24", "dd/MM/yy", { zone: "utc" }).toISODate(); // "2024-03-09" (yy: 00–69 → 20xx)
```

Custom tokens (literals go in `[brackets]`; unknown letters throw so typos are not silent):

|                | tokens                                                                  |
| -------------- | ----------------------------------------------------------------------- |
| year           | `yyyy` `yy` · ISO week-year `RRRR`                                      |
| month          | `MMMM` `MMM` `MM` `M`                                                   |
| day            | `dd` `d` · day of year `DDD` `D` · weekday `EEEE` `EEE`, ISO number `e` |
| week / quarter | `WW` `W` (ISO week) · `Q`                                               |
| time           | `HH` `H` `hh` `h` `mm` `m` `ss` `s` `SSS` `a`                           |
| zone           | `Z` (+0200) `ZZ` (+02:00) `ZZZ` (EST) `VV` (America/New_York)           |
| epoch          | `x` ms · `X` seconds                                                    |

`format()` supports every token; `fromFormat()` supports a documented subset. For fully localised output use
`toLocaleString(options, locale)` (a thin, cached wrapper over `Intl.DateTimeFormat` in the value's zone).

### Relative time

```ts
const base = DateTime.fromISO("2025-06-15T12:00:00Z", { zone: "utc" });
base.subtract({ hours: 3 }).toRelative({ base, locale: "en" }); // "3 hours ago"
base.add({ days: 2 }).toRelative({ base, locale: "de" }); // "in 2 Tagen"
yesterday.toRelativeCalendar({ base, locale: "en" }); // "yesterday" (by calendar day, not elapsed time)
```

Built on `Intl.RelativeTimeFormat`; picks the largest whole unit (truncating), or force one with `{ unit }`.

## Time zones and DST

See [docs/timezones.md](docs/timezones.md) for the full model. In short:

```ts
const NY = "America/New_York";
const gap = { year: 2025, month: 3, day: 9, hour: 2, minute: 30 }; // doesn't exist: clocks skip 02:00 → 03:00

DateTime.fromObject(gap, { zone: NY }).toISO(); // "2025-03-09T03:30:00.000-04:00"  ("compatible")
DateTime.fromObject(gap, { zone: NY, disambiguation: "earlier" }); // 01:30-05:00
DateTime.fromObject(gap, { zone: NY, disambiguation: "reject" }); // throws ChronexaError NONEXISTENT_LOCAL_TIME

inspectLocalTime(gap, NY).status; // "gap" | "unique" | "ambiguous"
resolveLocalTime(gap, NY); // strict by default: throws instead of guessing
nextTransition(NY, DateTime.now()).at.toISO(); // next DST switch
```

| `disambiguation`         | repeated time (fall back) | skipped time (spring forward) |
| ------------------------ | ------------------------- | ----------------------------- |
| `"compatible"` (default) | earlier instant           | shifted forward by the gap    |
| `"earlier"`              | earlier instant           | shifted back by the gap       |
| `"later"`                | later instant             | shifted forward by the gap    |
| `"reject"`               | throws                    | throws                        |

Zones come from `Intl`: pass an IANA id (`"Europe/Paris"`), `"utc"`, `"system"`, or a fixed offset (`"+05:30"`).
A fixed offset is **not** the IANA zone that happens to use it: it never changes with the seasons.

## Durations

```ts
const d = Duration.from({ months: 1, days: 2, hours: 3 });
d.toISO(); // "P1M2DT3H"
Duration.fromISO("PT90M").normalize().toObject(); // { hours: 1, minutes: 30 }
Duration.from({ minutes: 150 }).shiftTo(["hour", "minute"]).toObject(); // { hours: 2, minutes: 30 }
Duration.from({ days: 1, hours: 12 }).toHuman({ locale: "en" }); // "1 day, 12 hours"

d.toMillis(); // throws: a month has no fixed length
d.toMillis({ relativeTo: DateTime.fromISO("2024-02-01", { zone: "utc" }) }); // depends on February 2024
Duration.from({ days: 1 }).as("hour", { relativeTo: dstStartDay }); // 23
```

`years`, `months`, `weeks`, `days` are **calendar** units (their length depends on the date); `hours` … `milliseconds`
are **elapsed**. Chronexa never converts between the two without a `relativeTo` date. `compare()` and `equals()`
follow the same rule.

## Intervals

`Interval` is **half-open**: `[start, end)`. Empty intervals (`start == end`) are valid and overlap nothing;
`end < start` is rejected; intervals that share only a boundary _abut_ but do not _overlap_.

```ts
const a = Interval.between(t("10:00"), t("12:00"));
a.contains(t("12:00")); // false
a.overlaps(Interval.between(t("12:00"), t("13:00"))); // false (they abut)
a.intersection(Interval.between(t("11:00"), t("13:00"))); // [11:00, 12:00)
a.union(Interval.between(t("12:00"), t("13:00"))); // [10:00, 13:00)
a.gap(Interval.between(t("13:00"), t("14:00"))); // [12:00, 13:00)
a.subtract(Interval.between(t("11:00"), t("11:30"))); // [10:00, 11:00) and [11:30, 12:00)
a.splitBy({ minutes: 45 });
a.divideEqually(3);
a.splitAt(t("11:00"));
Interval.merge([a, b, c]); // sorted, disjoint; abutting intervals are joined
Interval.fromISO("2025-01-01T00:00Z/PT1H"); // start/end, start/duration, duration/end
```

## Business days

```ts
import { BusinessCalendar, holidayProvider } from "chronexa";

const cal = new BusinessCalendar({
  weekend: [6, 7], // ISO weekdays; [5, 6] for Fri–Sat weekends
  holidays: holidayProvider([
    // or a plain list of "YYYY-MM-DD", or your own function
    { type: "fixed", month: 12, day: 25 },
    { type: "nth-weekday", month: 11, weekday: 4, nth: 4 },
  ]),
});

cal.addBusinessDays(dec24, 1); // 2025-12-26 (Christmas skipped)
cal.countBusinessDays(start, end); // counts [start, end); pass { endInclusive: true } to include `end`
cal.isBusinessDay(date);
cal.nextBusinessDay(date);
cal.previousBusinessDay(date);
```

Chronexa ships **no** national holiday data and assumes none. Counting uses local calendar dates; the time of
day is kept when moving. `addBusinessDays(d, 0)` returns `d` even if it is a weekend.

## Recurrence

A documented **subset** of RFC 5545: `daily`/`weekly`/`monthly`/`yearly`, `interval`, `until` (inclusive), `count`,
`byWeekday`, `byMonthDay` (negative = from the end), `byNthWeekday`, `byMonth`, `exclude`, `weekStart`.
Not RFC-conformance-tested, and no `BYSETPOS`, `BYYEARDAY`, `BYWEEKNO`, sub-daily rules or `RDATE`.

```ts
const rule = new RecurrenceRule({
  freq: "monthly",
  start: DateTime.fromISO("2025-03-01T09:30:00", { zone: "America/New_York" }),
  byNthWeekday: [{ weekday: 2, nth: 2 }], // second Tuesday
  count: 5,
});
rule.all().map((d) => d.toISODate()); // 2025-03-11, 04-08, 05-13, 06-10, 07-08
rule.between(from, to);
rule.after(date);
rule.before(date);
[...rule.occurrences()];
```

Occurrences keep the wall-clock time of `start` across DST. `count` is applied before `exclude` (as in the RFC).
A day that doesn't exist in a month (the 31st, Feb 29) is skipped by default or clamped with `invalidDate: "clamp"`.
`start` is an occurrence only if it matches the rule.

## Date utilities

`isLeapYear`, `daysInMonth`, `daysInYear`, `dayOfYear`, `isoWeekday`, `isoWeek` (ISO 8601 week + week-year),
`weeksInIsoYear`, `quarterOf`, `min`, `max`, `clamp`, `compare`, `countDays(a, b, { inclusive })`.
The numeric helpers live in their own module, so importing only them adds ~2 kB to a bundle.

## Error handling

| Situation                                                                                             | Behaviour                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factories and arithmetic given bad input                                                              | **throw** `ChronexaError` (`code`: `INVALID_ARGUMENT`, `INVALID_DATE`, `INVALID_ZONE`, `INVALID_LOCALE`, `PARSE_ERROR`, `AMBIGUOUS_LOCAL_TIME`, `NONEXISTENT_LOCAL_TIME`, `OUT_OF_RANGE`, `UNSUPPORTED`, `UNBOUNDED`) |
| You'd rather not use `try/catch`                                                                      | `DateTime.tryFromISO / tryFromFormat / tryFromObject`, `Duration.tryFromISO`, `Interval.tryFromISO` return `Result<T>`                                                                                                |
| Set operations with no answer (`intersection`, `gap`, `after`, …)                                     | return `null`                                                                                                                                                                                                         |
| Anything that would require guessing (`Duration.toMillis` with months, DST ambiguity with `"reject"`) | throw; the message says how to fix it                                                                                                                                                                                 |

```ts
const r = DateTime.tryFromISO(userInput);
if (!r.ok) return showError(r.error.message); // "Cannot parse "…": day 30 does not exist in 2025-02; invalid dates are never rolled over."
use(r.value);
```

## TypeScript

Strict types, no `any`. Unit arguments are closed unions (`"year" | "month" | …`); unsupported inputs fail at
compile time, which is checked by type tests (`tests/types.test-d.ts`) and by compiling a consumer project against the
packed tarball under NodeNext (ESM and CJS) and Bundler resolution.

```ts
dt.add({ day: 1 }); // ✗ duration keys are plural: { days: 1 }
dt.startOf("decade"); // ✗
dt.diff(other, "days"); // ✗ unit arguments are singular
new DateTime(); // ✗ use a factory
```

## Browser and Node usage

No Node APIs are used. A test bundles the library for the browser and runs it in a bare V8 context with no `process`,
`require` or `Buffer`. (That is a smoke test, not a substitute for testing in your target browsers.)

```html
<script type="module">
  import { DateTime } from "https://cdn.jsdelivr.net/npm/chronexa/dist/index.js";
  console.log(DateTime.now({ zone: "Asia/Tokyo" }).toISO());
</script>
```

Named zones, locale names and relative-time wording come from the runtime's `Intl`/ICU data. Different runtimes can
ship different tz-database versions and locale data; see [docs/timezones.md](docs/timezones.md#runtime-requirements-and-limits).

## Performance and size

Measured, not claimed: see [docs/benchmarks.md](docs/benchmarks.md) for methodology, caveats and results
(Chronexa is faster than Luxon on some operations and slower on others in the recorded run).
A bundle importing `DateTime` was 38 kB minified / 13.5 kB gzip versus 71 kB / 22 kB for Luxon as bundled by esbuild
(Luxon is not tree-shakeable and the libraries have different features). `npm run bench` and `npm run size` reproduce both.

## Compatibility

|                      |                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Node.js              | ≥ 20 (developed and tested locally on 22; the CI matrix covers 20, 22, 24)                                                          |
| Browsers             | Modern evergreen browsers with `Intl.DateTimeFormat` time zones and `Intl.RelativeTimeFormat` (ES2022 syntax, private class fields) |
| Module formats       | ESM (`import`), CommonJS (`require`), `.d.ts` / `.d.cts`                                                                            |
| Runtime dependencies | none                                                                                                                                |

## Migrating from Luxon

[docs/migration-from-luxon.md](docs/migration-from-luxon.md) maps common tasks and lists behavioural differences
(invalid dates, DST handling, calendar arithmetic, parsing). Chronexa is **not** a drop-in replacement.

## Known limitations

- Named zones are supported for years 1–9999 only (UTC and fixed offsets cover the full `Date` range).
- Time-zone data is whatever your runtime's ICU provides; historical accuracy is only as good as that data.
- No leap seconds. No non-Gregorian calendars (locale-formatted output via `Intl` may use them, token-based `format()` does not).
- Local-time resolution assumes at most one offset change in a 48-hour window around the time (true for all modern zones; it throws rather than guess otherwise).
- `isInDST` is a heuristic (offset greater than the smaller of the January and July offsets).
- `endOf("hour" | "minute" | "second")` uses elapsed boundaries, which differs from wall-clock boundaries only in zones that shift by a non-whole hour mid-hour.
- Recurrence is a subset of RFC 5545 and not conformance-tested. Business-day iteration is O(days).
- Sub-millisecond precision is not supported. ISO fractions are truncated, not rounded.
- Not yet run in real browsers or on Node 20/24 by the author; CI is configured to do so.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm run check` runs typecheck, lint, formatting, tests, type tests, build and package validation.

## License

MIT, see [LICENSE](LICENSE).
