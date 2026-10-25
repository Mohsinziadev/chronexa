# Business Days & Recurrence

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

Chronexa ships **no** national holiday data and assumes none. Counting uses local calendar dates; the time of day is kept when moving. `addBusinessDays(d, 0)` returns `d` even if it is a weekend. Business-day iteration is O(days).

## Recurrence

A documented **subset** of RFC 5545: `daily`/`weekly`/`monthly`/`yearly`, `interval`, `until` (inclusive), `count`, `byWeekday`, `byMonthDay` (negative = from the end), `byNthWeekday`, `byMonth`, `exclude`, `weekStart`.

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

- Occurrences keep the wall-clock time of `start` across DST.
- `count` is applied before `exclude` (as in the RFC).
- A day that doesn't exist in a month (the 31st, Feb 29) is skipped by default or clamped with `invalidDate: "clamp"`.
- `start` is an occurrence only if it matches the rule.
