import { DateTime, inspectLocalTime } from "chronexa";

const NY = "America/New_York";
const gap = { year: 2025, month: 3, day: 9, hour: 2, minute: 30 }; // clocks skip 02:00 → 03:00

inspectLocalTime(gap, NY).status; // "gap"
DateTime.fromObject(gap, { zone: NY }).toISO(); // "2025-03-09T03:30:00.000-04:00"  compatible
DateTime.fromObject(gap, { zone: NY, disambiguation: "earlier" }).toISO(); // 01:30-05:00
DateTime.fromObject(gap, { zone: NY, disambiguation: "reject" }); // throws NONEXISTENT_LOCAL_TIME
