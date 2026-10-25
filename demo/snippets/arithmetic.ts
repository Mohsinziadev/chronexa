import { DateTime } from "chronexa";

const evening = DateTime.fromISO("2025-03-08T22:00:00", { zone: "America/New_York" });

evening.add({ hours: 24 }).toISO(); // "2025-03-09T23:00:00.000-04:00"  elapsed time
evening.add({ days: 1 }).toISO(); //   "2025-03-09T22:00:00.000-04:00"  calendar time

const a = DateTime.fromISO("2024-01-31", { zone: "utc" });
const b = DateTime.fromISO("2024-03-04", { zone: "utc" });

b.elapsed(a, "hour"); //                   792   exact elapsed time
b.diff(a, ["month", "day"]).toObject(); // { months: 1, days: 4 }
b.calendarDiff(a, "month"); //             2     boundaries crossed
