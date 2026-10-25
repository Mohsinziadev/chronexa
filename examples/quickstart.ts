// Run: npx tsx examples/quickstart.ts
// In your own project import from "chronexa"; here we import from source.
import { DateTime, Duration, Interval, Settings } from "../src/index.js";

// A frozen clock makes the output reproducible. (Skip this in real code.)
Settings.now = () => Date.UTC(2025, 2, 7, 15, 30); // 2025-03-07T15:30:00Z

const now = DateTime.now({ zone: "America/New_York" });
console.log(now.toISO()); //                       2025-03-07T10:30:00.000-05:00
console.log(now.add({ days: 7 }).toISODate()); //  2025-03-14
console.log(now.subtract({ months: 1 }).toISODate()); // 2025-02-07
console.log(now.startOf("day").toISO()); //        2025-03-07T00:00:00.000-05:00
console.log(now.endOf("month").toISO()); //        2025-03-31T23:59:59.999-04:00
console.log(now.isAfter(DateTime.fromISO("2025-01-01", { zone: "utc" }))); // true

// Strict parsing: no silent rollover
const bad = DateTime.tryFromISO("2025-02-30");
console.log(bad.ok ? "parsed" : bad.error.message);

// Formatting
console.log(now.format("EEEE, d MMMM yyyy [at] HH:mm ZZZ", { locale: "en" }));
console.log(now.toLocaleString({ dateStyle: "full", timeStyle: "short" }, "de"));
console.log(now.subtract({ hours: 3 }).toRelative({ locale: "en" })); // 3 hours ago

// Durations and intervals
const d = Duration.from({ hours: 1, minutes: 90 });
console.log(d.normalize().toISO(), "|", d.toHuman({ locale: "en" }));
const meeting = Interval.after(now, { hours: 1 });
console.log(meeting.contains(now.add({ minutes: 59 })), meeting.contains(now.add({ hours: 1 }))); // true false
