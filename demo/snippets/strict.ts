import { DateTime } from "chronexa";

DateTime.fromISO("2025-02-30", { zone: "utc" });
// ChronexaError [INVALID_DATE]: Cannot parse "2025-02-30" as an ISO 8601 date/time: day 30 does not exist in 2025-02;
// invalid dates are never rolled over.

const result = DateTime.tryFromISO("2025-02-30");
if (!result.ok) {
  console.log(result.error.code); // "INVALID_DATE"
  console.log(result.error.message); // says exactly what is wrong and how to fix it
}

DateTime.fromISO("2024-01-31", { zone: "utc" }).add({ months: 1 }).toISODate();
// "2024-02-29"  add() clamps to month end (documented); set({ month: 2 }) would throw
