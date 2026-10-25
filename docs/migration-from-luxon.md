# Migrating from Luxon

Chronexa solves the same problem space as [Luxon](https://moment.github.io/luxon/) with its own API and its own
trade-offs. It is **not** a drop-in replacement and does not try to be. This page maps common tasks and lists the
behavioural differences that will bite if you port code mechanically.

The "Luxon" column describes Luxon 3.7 as exercised while writing this guide; check Luxon's documentation for
your version. Output shown for both libraries was produced by running both (the checks are in
`tests/` for Chronexa; the Luxon side was run once while writing this page).

## Task mapping

| Task                | Luxon                                                           | Chronexa                                                                                           |
| ------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Now                 | `DateTime.now()`                                                | `DateTime.now()` (clock injectable via `Settings.now`)                                             |
| From epoch ms       | `DateTime.fromMillis(ms, { zone })`                             | `DateTime.fromMillis(ms, { zone })`                                                                |
| From components     | `DateTime.fromObject({ year, month, day }, { zone })`           | `DateTime.fromObject({ year, month, day }, { zone })` (`year` required, no "current year" default) |
| Parse ISO           | `DateTime.fromISO(s, { zone, setZone })`                        | `DateTime.fromISO(s, { zone, setZone })` (stricter, see below)                                     |
| Parse custom        | `DateTime.fromFormat(s, fmt, opts)`                             | `DateTime.fromFormat(s, fmt, opts)` (different token set)                                          |
| Safe parse          | `dt.isValid` / `invalidReason`                                  | `DateTime.tryFromISO(s)` → `{ ok, value \| error }`                                                |
| Add / subtract      | `dt.plus({ days: 1 })`, `dt.minus(…)`                           | `dt.add({ days: 1 })`, `dt.subtract(…)`                                                            |
| Start / end of unit | `startOf("month")`, `endOf("month")`                            | same names                                                                                         |
| Format (tokens)     | `dt.toFormat("yyyy-MM-dd")`                                     | `dt.format("yyyy-MM-dd")`                                                                          |
| Format (locale)     | `dt.toLocaleString(DateTime.DATE_MED)`                          | `dt.toLocaleString({ dateStyle: "medium" }, locale)` (plain `Intl` options)                        |
| Convert zone        | `dt.setZone("Asia/Tokyo")`, `dt.toUTC()`                        | `dt.toZone("Asia/Tokyo")`, `dt.toUTC()`                                                            |
| Replace fields      | `dt.set({ hour: 5 })`                                           | `dt.set({ hour: 5 })`                                                                              |
| Compare             | `a < b`, `a.equals(b)`, `hasSame(b, "day")`                     | `a < b`, `a.equals(b)`, `a.isSame(b, "day")`, `isBefore`/`isAfter`                                 |
| Difference          | `b.diff(a, ["months", "days"])`                                 | `b.diff(a, ["month", "day"])` (singular unit names)                                                |
| Duration            | `Duration.fromObject({ hours: 2 })`                             | `Duration.from({ hours: 2 })`                                                                      |
| Duration units      | `dur.shiftTo("hours", "minutes")`                               | `dur.shiftTo(["hour", "minute"])`                                                                  |
| Human duration      | `dur.toHuman()`                                                 | `dur.toHuman({ locale })`                                                                          |
| Interval            | `Interval.fromDateTimes(a, b)`                                  | `Interval.between(a, b)`                                                                           |
| Interval ops        | `overlaps`, `intersection`, `union`, `splitBy`, `divideEqually` | same names, plus `gap`, `subtract`, `splitAt`, `merge`, `abuts`, `engulfs`                         |
| Relative time       | `dt.toRelative({ base })`                                       | `dt.toRelative({ base, locale })`, `toRelativeCalendar`                                            |

```ts
// Luxon
const due = DateTime.fromISO("2025-03-09T09:00", { zone: "America/New_York" })
  .plus({ days: 30 })
  .toFormat("yyyy-MM-dd");
// Chronexa
const due = DateTime.fromISO("2025-03-09T09:00", { zone: "America/New_York" })
  .add({ days: 30 })
  .format("yyyy-MM-dd");
```

Method arguments use **singular** unit names (`"day"`, `"month"`); object keys are **plural** (`{ days: 1 }`).
Luxon uses plural in both places.

## Behavioural differences

Each row below was checked by running both libraries (Luxon 3.7.2).

| Topic                                    | Luxon                                                                                                                                                                        | Chronexa                                                                                                                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Invalid input**                        | Returns an _invalid_ `DateTime` (`isValid === false`, `invalidReason: "unit out of range"`) unless `Settings.throwOnInvalid` is set. Later calls on it propagate invalidity. | There are no invalid instances. Factories **throw** `ChronexaError` (with a `code`); `try*` variants return a `Result`. Code that checks `isValid` becomes `try/catch` or `r.ok`.                                                                      |
| **`set()` on a short month**             | `Jan 31 .set({ month: 2 })` → `2024-02-29` (clamps)                                                                                                                          | **Throws** `INVALID_DATE`: `set` never adjusts. Use `add({ months: 1 })` (clamps) when you want month-end clamping.                                                                                                                                    |
| **`diff` precision**                     | `diff(x, "days").days` is **fractional** (`0.5` for 12 hours).                                                                                                               | `diff(x, "day")` is **whole** calendar units (truncated, `0`). For exact fractions of elapsed time use `elapsed(x, "hour")` or `diff(x, "hour", { fractional: true })`.                                                                                |
| **Month/year/day lengths in `Duration`** | `Duration.fromObject({ months: 1 }).toMillis()` → `2592000000` (30-day convention); `{ days: 1 }.shiftTo("hours")` → 24.                                                     | **Throws** unless you pass `{ relativeTo: dateTime }`; the answer is then computed on the real calendar (29 days for Feb 2024, 23 hours for a spring-forward day).                                                                                     |
| **`Duration.normalize()`**               | Does not turn 90 minutes into 1 h 30 m (use `shiftTo`).                                                                                                                      | Cascades inside the elapsed group and inside the calendar group (90 min → 1 h 30 m; 14 months → 1 y 2 m); never crosses groups.                                                                                                                        |
| **Interval endpoints**                   | `[start, end)`; a reversed interval is an invalid `Interval`.                                                                                                                | `[start, end)` too; a reversed interval **throws** (`Interval.fromUnordered` reorders). Empty intervals are valid and overlap nothing.                                                                                                                 |
| **`equals`**                             | Compares instant **and** zone (`UTC` vs `America/New_York` at the same instant → `false`).                                                                                   | Compares the **instant only** (`true`). Compare `a.zone.equals(b.zone)` if you also need the zone.                                                                                                                                                     |
| **ISO parsing strictness**               | Accepts lower-case `t` (`2024-01-01t10:00` is valid).                                                                                                                        | Rejects it. Also rejects a space separator, mixed basic/extended formats, leap seconds, lenient forms. Luxon and Chronexa both reject `2024-01-01 10:00`, both accept `24:00:00`, both truncate extra fractional digits. See [parsing.md](parsing.md). |
| **Parsing without an offset**            | Wall time in the default zone (system zone unless `Settings.defaultZone`).                                                                                                   | Same default; also `Settings.defaultZone` or `{ zone }`. Ambiguous and nonexistent wall times follow `disambiguation` (`"reject"` available).                                                                                                          |
| **DST gaps / overlaps**                  | Gap `02:30` → `03:30`; overlap `01:30` → first (earlier) occurrence.                                                                                                         | Same for the default (`"compatible"`), but the policy is explicit (`"earlier"`, `"later"`, `"reject"`) and inspectable (`inspectLocalTime`). Arithmetic prefers the occurrence you are already in (it won't jump between the two 01:30s).              |
| **Calendar vs elapsed arithmetic**       | `plus({ days: 1 })` keeps wall time; `plus({ hours: 24 })` is elapsed.                                                                                                       | Identical semantics (`2025-03-08T22:00 NY` + 1 day → `03-09T22:00-04:00`; + 24 h → `03-09T23:00-04:00`).                                                                                                                                               |
| **Fixed-offset zone name**               | `setZone: true` with `+02:00` → zone name `UTC+2`.                                                                                                                           | Zone kind `fixed`, name `+02:00`. Fixed offsets and IANA zones are different kinds.                                                                                                                                                                    |
| **Format tokens**                        | Luxon's own token set (`cccc`, `LLLL`, `DDD` localized presets, …). Unquoted literal text is passed through when it is not a token (`'at'` quoting also works).              | Different set (`EEEE`, `MMMM`, …; see README). **Unknown letters throw**; literals go in `[brackets]`. There are no localized preset tokens; use `toLocaleString`.                                                                                     |
| **Missing components in `fromObject`**   | Missing larger units default to the current date.                                                                                                                            | Only `year` is required; the rest default to their minimum. Nothing depends on "now".                                                                                                                                                                  |
| **Global settings**                      | `Settings.defaultZone`, `defaultLocale`, `now`, `throwOnInvalid`, …                                                                                                          | `Settings.defaultZone`, `defaultLocale`, `now`, `withNow(ms, fn)`, `reset()`. No `throwOnInvalid` (it always throws).                                                                                                                                  |

## What Chronexa adds

`BusinessCalendar` (+ rule-based holidays), `RecurrenceRule`, `inspectLocalTime` / `resolveLocalTime` /
`nextTransition`, `Result`-returning parsers, `calendarDiff` (boundaries crossed), `Interval.gap` / `subtract` /
`merge`, `Duration` that refuses to guess the length of a month, and ISO week-date parsing.

## What Luxon has that Chronexa does not (yet)

Localized preset formats (`DateTime.DATE_MED`), `toLocaleParts`, `Info` (month/weekday/meridiem lists, features),
non-Gregorian output calendars as first-class options, `fromSQL`/`fromRFC2822`/`fromHTTP` parsers, `DateTime.expandFormat`,
`Duration.toFormat`, and `Settings.throwOnInvalid`.
If you rely on these, keep Luxon alongside Chronexa or wrap the specific call.

## A gradual migration

Both libraries can coexist. Convert at the boundary by instant, which is lossless:

```ts
const c = DateTime.fromMillis(luxonDt.toMillis(), { zone: luxonDt.zoneName ?? "utc" });
const l = LuxonDateTime.fromMillis(c.toMillis(), { zone: c.zone.name });
```

Port the places where correctness matters first (parsing user input, scheduling across zones, business-day
maths) and add tests around DST dates for the zones you serve. There is no compatibility layer yet; if you need
one, it should live outside the core package.
