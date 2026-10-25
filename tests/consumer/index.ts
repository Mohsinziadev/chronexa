// Compiled against the PACKED package (see scripts/validate-package.mjs), never against src/.
import {
  BusinessCalendar,
  ChronexaError,
  DateTime,
  Duration,
  Interval,
  RecurrenceRule,
  Zone,
  resolveLocalTime,
  type DateTimeUnit,
  type Result,
} from "chronexa";

const now: DateTime = DateTime.fromISO("2025-03-09T01:30:00", { zone: "America/New_York" });
const next: DateTime = now.add({ days: 1, hours: 2 }).startOf("hour");
const unit: DateTimeUnit = "quarter";
const iso: string = next.endOf(unit).toISO();
const r: Result<DateTime> = DateTime.tryFromISO("nope");
if (!r.ok) {
  const e: ChronexaError = r.error;
  const code: string = e.code;
  void code;
}
const d: Duration = Duration.from({ hours: 1 });
const i: Interval = Interval.between(now, next);
const z: Zone = Zone.from("utc");
const biz: BusinessCalendar = new BusinessCalendar({ holidays: ["2025-12-25"] });
const rule = new RecurrenceRule({ freq: "weekly", start: now, byWeekday: [1, 3], count: 3 });
const occurrences: DateTime[] = rule.all();
const strict: DateTime = resolveLocalTime({ year: 2025, month: 1, day: 1 }, "utc");
void [iso, d, i, z, biz, occurrences, strict];

// @ts-expect-error month must be a number
DateTime.fromObject({ year: 2025, month: "1" });
// @ts-expect-error singular key is not a Duration unit
now.add({ day: 1 });
