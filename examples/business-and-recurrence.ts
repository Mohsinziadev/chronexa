// Run: npx tsx examples/business-and-recurrence.ts
import { BusinessCalendar, DateTime, RecurrenceRule, holidayProvider } from "../src/index.js";

const at = (iso: string) => DateTime.fromISO(iso, { zone: "America/New_York" });

// You describe your own holidays; Chronexa ships none.
const calendar = new BusinessCalendar({
  weekend: [6, 7],
  holidays: holidayProvider([
    { type: "fixed", month: 12, day: 25 },
    { type: "nth-weekday", month: 11, weekday: 4, nth: 4 }, // 4th Thursday of November
  ]),
});

console.log(calendar.addBusinessDays(at("2025-12-24T09:00:00"), 1).toISODate()); // 2025-12-26
console.log(calendar.countBusinessDays(at("2025-12-22"), at("2025-12-29"))); //    4  ([start, end))
console.log(calendar.isBusinessDay(at("2025-11-27"))); //                           false

// Second Tuesday of every month at 09:30 New York time, five times
const patchDay = new RecurrenceRule({
  freq: "monthly",
  start: at("2025-03-01T09:30:00"),
  byNthWeekday: [{ weekday: 2, nth: 2 }],
  count: 5,
});
console.log(patchDay.all().map((d) => d.toISO()));

// Every other week on Mon/Wed, except one date
const standup = new RecurrenceRule({
  freq: "weekly",
  interval: 2,
  byWeekday: [1, 3],
  start: at("2025-03-03T10:00:00"),
  count: 6,
  exclude: ["2025-03-05"],
});
console.log(standup.all().map((d) => d.toISODate()));
