# DateTime

## Creating values

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

Text parsing is covered in [Parsing](parsing.md).

## Reading values

`dt.year`, `month` (1–12), `day`, `hour`, `minute`, `second`, `millisecond`, `weekday` (ISO: Mon=1…Sun=7), `ordinal`, `quarter`, `weekYear`, `weekNumber` (ISO 8601), `daysInMonth`, `isLeapYear`, `offset` (minutes), `zone`, `isInDST`.

Conversion: `toMillis()`, `toSeconds()`, `toJSDate()`, `toISO()`, `toObject()`, `toZone(z)`, `toUTC()`, `toLocal()`. `JSON.stringify` gives ISO 8601.

## Arithmetic

```ts
const d = DateTime.fromISO("2024-01-31T10:00:00", { zone: "utc" });
d.add({ months: 1 }).toISODate(); // "2024-02-29"  (clamped to month end)
d.add({ months: 1, days: 1, hours: 2 }); // calendar units first, then elapsed units
d.set({ hour: 5 }); // replaces fields; set({ month: 2 }) throws (Jan 31 → Feb 31)
d.startOf("quarter");
d.endOf("week", { weekStart: 7 }); // weeks start Monday unless told otherwise
```

`add` clamps to the end of the month; `set` never does. If a field cannot take the requested value, `set` throws instead of rolling over.

## Differences

Three different questions, three different methods:

```ts
const a = DateTime.fromISO("2024-01-31T00:00:00", { zone: "utc" });
const b = DateTime.fromISO("2024-03-04T00:00:00", { zone: "utc" });

b.elapsed(a, "hour"); // 792      exact elapsed time (hour/minute/second/millisecond only)
b.diff(a, ["month", "day"]).toObject(); // { months: 1, days: 4 }  whole calendar units, truncated
b.calendarDiff(a, "month"); // 2        calendar boundaries crossed (Jan → Mar)
```

## Comparing

`isBefore`, `isAfter`, `equals` and the standalone `min`, `max`, `clamp` and `compare` helpers all compare instants, so two values in different zones are equal when they are the same moment.

## Date utilities

`isLeapYear`, `daysInMonth`, `daysInYear`, `dayOfYear`, `isoWeekday`, `isoWeek` (ISO 8601 week + week-year), `weeksInIsoYear`, `quarterOf`, `min`, `max`, `clamp`, `compare`, `countDays(a, b, { inclusive })`. The numeric helpers live in their own module, so importing only them adds ~2 kB to a bundle.
