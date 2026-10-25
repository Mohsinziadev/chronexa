# Formatting

## Custom tokens

`format()` supports every token. Literals go in `[brackets]`; unknown letters throw so typos are not silent.

|                | tokens                                                                  |
| -------------- | ----------------------------------------------------------------------- |
| year           | `yyyy` `yy` · ISO week-year `RRRR`                                      |
| month          | `MMMM` `MMM` `MM` `M`                                                   |
| day            | `dd` `d` · day of year `DDD` `D` · weekday `EEEE` `EEE`, ISO number `e` |
| week / quarter | `WW` `W` (ISO week) · `Q`                                               |
| time           | `HH` `H` `hh` `h` `mm` `m` `ss` `s` `SSS` `a`                           |
| zone           | `Z` (+0200) `ZZ` (+02:00) `ZZZ` (EST) `VV` (America/New_York)           |
| epoch          | `x` ms · `X` seconds                                                    |

```ts
now.format("EEEE, d MMMM yyyy [at] HH:mm ZZZ", { locale: "en" }); // "Friday, 7 March 2025 at 10:30 EST"
```

`fromFormat()` supports a documented subset of these tokens; see [Parsing](parsing.md).

## Localised output

For fully localised output use `toLocaleString(options, locale)`, a thin, cached wrapper over `Intl.DateTimeFormat` in the value's zone.

```ts
now.toLocaleString({ dateStyle: "full", timeStyle: "short" }, "de"); // "Freitag, 7. März 2025 um 10:30"
```

## ISO 8601 output

```ts
DateTime.fromISO("20240309T102030Z", { zone: "utc" }).toISO({
  format: "basic",
  suppressMilliseconds: true,
}); // "20240309T102030Z"
```

## Relative time

Built on `Intl.RelativeTimeFormat`; picks the largest whole unit (truncating), or force one with `{ unit }`.

```ts
const base = DateTime.fromISO("2025-06-15T12:00:00Z", { zone: "utc" });

base.subtract({ hours: 3 }).toRelative({ base, locale: "en" }); // "3 hours ago"
base.add({ days: 2 }).toRelative({ base, locale: "de" }); // "in 2 Tagen"
yesterday.toRelativeCalendar({ base, locale: "en" }); // "yesterday" (by calendar day, not elapsed time)
```

`toRelativeCalendar` counts calendar days rather than elapsed time, so 23:50 yesterday is still "yesterday" at 00:10.

## Durations

```ts
Duration.from({ days: 1, hours: 12 }).toHuman({ locale: "en" }); // "1 day, 12 hours"
Duration.from({ months: 1, days: 2, hours: 3 }).toISO(); // "P1M2DT3H"
```
