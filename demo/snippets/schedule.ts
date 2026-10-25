import { BusinessCalendar, DateTime, RecurrenceRule, holidayProvider } from "chronexa";

const cal = new BusinessCalendar({
  weekend: [6, 7],
  holidays: holidayProvider([{ type: "fixed", month: 12, day: 25 }]),
});
cal.addBusinessDays(DateTime.fromISO("2025-12-24", { zone: "utc" }), 1).toISODate(); // "2025-12-26"

const patchDay = new RecurrenceRule({
  freq: "monthly",
  start: DateTime.fromISO("2025-03-01T09:30:00", { zone: "America/New_York" }),
  byNthWeekday: [{ weekday: 2, nth: 2 }], // second Tuesday
  count: 5,
});
patchDay.all().map((d) => d.toISODate()); // 03-11, 04-08, 05-13, 06-10, 07-08
