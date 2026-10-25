# Parsing

Chronexa never calls `Date.parse` or `new Date(string)`. Both parsers are implemented in the library, run
the same on every runtime, and validate the calendar: an impossible date is an error, never a rolled-over one.

## `DateTime.fromISO(text, options)`

Options: `zone`, `locale`, `setZone`, `disambiguation`.

- Text **with** an offset (`Z`, `+02:00`) is an absolute instant. It is shown in `zone` (default: system zone), or
  keeps its own offset as a fixed-offset zone with `setZone: true`.
- Text **without** an offset is a wall-clock time in `zone`. If that wall time is ambiguous or does not exist in
  the zone, `disambiguation` decides (default `"compatible"`; `"reject"` throws).

### Supported grammar

| Form                                                          | Examples                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Calendar date                                                 | `2024-03-09`, `20240309`, `2024-03` (first of month), `2024` (Jan 1)                              |
| Ordinal date                                                  | `2024-069`, `2024069`                                                                             |
| Week date                                                     | `2024-W10-6`, `2024W106`, `2024-W10` (Monday of that week)                                        |
| Expanded years                                                | `+012024-03-09`, `-000044-03-15` (`-000000` is rejected)                                          |
| Time (after a **complete** date, separated by upper-case `T`) | `T10`, `T10:20`, `T10:20:30`, `T10:20:30.123`, `T10:20:30,5`, `T102030`, `T1020`                  |
| End of day                                                    | `T24:00`, `T24:00:00` (exactly zero minutes/seconds/fraction) → next day 00:00                    |
| Offsets                                                       | `Z`, `+02`, `+02:00`, `+0200`, and `±hh:mm:ss` for historical offsets                             |
| Fraction                                                      | any number of digits after `.` or `,` on the seconds; **truncated** (not rounded) to milliseconds |

Date and time must use the same style: `2024-03-09T10:20` and `20240309T1020` are valid, `20240309T10:20` is not.

### Not supported (documented, not silently handled)

- Leap seconds (`:60`) → `INVALID_DATE`
- Fractional hours or minutes (`T10.5`, `T10:20.5`)
- Lower-case `t` / `z`, a space instead of `T`, surrounding whitespace
- Reduced precision with a time (`2024-03T10:00`)
- Basic-format `YYYYMM` (ambiguous with `YYMMDD`)
- Two-digit years, durations/intervals (use `Duration.fromISO` / `Interval.fromISO`), recurrence strings
- Week-based formats with a week-day outside 1–7 or a week number beyond the year's last week (`2023-W53-1`)

Chronexa does not claim "complete ISO 8601" support; the table above is the contract and is covered by tests.

### Error codes

`PARSE_ERROR` — the text is not in a supported form. `INVALID_DATE` — the form is fine but a value is out of
range for the calendar (`2024-02-30`, `T25:00`). Messages say which part is wrong.

## `DateTime.fromFormat(text, format, options)`

The whole string must match. Same options as `fromISO` plus `defaults` (for components the format doesn't capture;
`year` has no default). Matching of names (months, weekdays, am/pm) is case-insensitive and uses the locale's `Intl` data.

| Token                                   | Meaning                                                             |       Parse       |
| --------------------------------------- | ------------------------------------------------------------------- | :---------------: |
| `yyyy` / `yy`                           | 4-digit year / 2-digit year (00–69 → 2000s, 70–99 → 1900s)          |         ✓         |
| `MMMM` `MMM` `MM` `M`                   | month name, short name, 2-digit, 1–2 digit                          |         ✓         |
| `dd` `d`                                | day of month                                                        |         ✓         |
| `EEEE` `EEE`                            | weekday name (validated against the date)                           |         ✓         |
| `HH` `H`                                | 24-hour clock                                                       |         ✓         |
| `hh` `h` + `a`                          | 12-hour clock (must be used together with `a`)                      |         ✓         |
| `mm` `m` `ss` `s`                       | minutes, seconds                                                    |         ✓         |
| `SSS`                                   | exactly three digits of milliseconds                                |         ✓         |
| `Z` / `ZZ`                              | `+0200` / `+02:00` (or `Z`) → absolute instant                      |         ✓         |
| `VV`                                    | IANA identifier → wall time in that zone                            |         ✓         |
| `x` / `X`                               | epoch milliseconds / seconds (cannot be combined with other tokens) |         ✓         |
| `e` `Q` `W` `WW` `RRRR` `D` `DDD` `ZZZ` | format-only                                                         | ✗ (`UNSUPPORTED`) |

Literal text goes in square brackets: `"yyyy-MM-dd [at] HH:mm"`. Unescaped letters that are not tokens throw, so
typos never pass silently. Using both an offset and `VV` in one format is rejected.

```ts
DateTime.fromFormat("Saturday, March 9, 2024", "EEEE, MMMM d, yyyy", { zone: "utc" }); // ok
DateTime.fromFormat("Sunday, March 9, 2024", "EEEE, MMMM d, yyyy", { zone: "utc" }); // throws: weekday mismatch
DateTime.fromFormat("2024-02-30", "yyyy-MM-dd", { zone: "utc" }); // throws: day does not exist
DateTime.fromFormat("14:30", "HH:mm", { zone: "utc", defaults: { year: 2025, month: 6, day: 1 } });
```

## Durations and intervals

`Duration.fromISO`: `PnYnMnWnDTnHnMnS`, optional leading `+`/`-`, comma or dot decimal on **seconds only**;
designators must be in order; `P`, `PT`, `P1.5D`, `PT1D` are rejected. `Interval.fromISO`: `start/end`,
`start/duration`, `duration/end`.
