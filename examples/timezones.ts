// Run: npx tsx examples/timezones.ts
import { DateTime, inspectLocalTime, nextTransition, resolveLocalTime } from "../src/index.js";

const NY = "America/New_York";

// One instant, several views
const instant = DateTime.fromISO("2025-06-15T12:00:00Z", { zone: "utc" });
console.log(instant.toZone(NY).toISO(), "|", instant.toZone("Asia/Kolkata").toISO());

// Spring forward: 02:30 does not exist on 2025-03-09 in New York
const missing = { year: 2025, month: 3, day: 9, hour: 2, minute: 30 };
console.log(inspectLocalTime(missing, NY).status); //  gap
console.log(DateTime.fromObject(missing, { zone: NY }).toISO()); // compatible → 03:30 EDT
try {
  resolveLocalTime(missing, NY); // strict by default
} catch (e) {
  console.log((e as Error).message);
}

// Fall back: 01:30 happens twice on 2025-11-02
const twice = { year: 2025, month: 11, day: 2, hour: 1, minute: 30 };
const report = inspectLocalTime(twice, NY);
console.log(
  report.status,
  report.candidates.map((c) => c.toISO()),
);
console.log(DateTime.fromObject(twice, { zone: NY, disambiguation: "later" }).toISO());

// Elapsed vs calendar arithmetic across the spring-forward night
const evening = DateTime.fromISO("2025-03-08T22:00:00", { zone: NY });
console.log(evening.add({ hours: 24 }).toISO()); //  elapsed:  2025-03-09T23:00:00.000-04:00
console.log(evening.add({ days: 1 }).toISO()); //    calendar: 2025-03-09T22:00:00.000-04:00

// When is the next DST switch?
const t = nextTransition(NY, DateTime.fromISO("2025-01-01", { zone: NY }))!;
console.log(t.at.toISO(), `${t.offsetBeforeMinutes} → ${t.offsetAfterMinutes} min`);
