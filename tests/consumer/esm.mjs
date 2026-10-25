import assert from "node:assert/strict";
import {
  DateTime,
  Duration,
  Interval,
  BusinessCalendar,
  RecurrenceRule,
  ChronexaError,
} from "chronexa";

const d = DateTime.fromISO("2025-03-09T01:30:00", { zone: "America/New_York" });
assert.equal(d.add({ hours: 1 }).toISO(), "2025-03-09T03:30:00.000-04:00");
assert.equal(Duration.fromISO("PT90M").normalize().toISO(), "PT1H30M");
assert.equal(
  Interval.fromISO("2025-01-01T00:00:00Z/PT1H", { zone: "utc" }).toDuration().toISO(),
  "PT1H",
);
assert.equal(
  new BusinessCalendar().isBusinessDay(DateTime.fromISO("2025-03-08", { zone: "utc" })),
  false,
);
assert.equal(new RecurrenceRule({ freq: "daily", start: d, count: 2 }).all().length, 2);
assert.throws(() => DateTime.fromISO("2025-02-30"), ChronexaError);
console.log("esm ok");
