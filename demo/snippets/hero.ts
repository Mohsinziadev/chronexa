import { DateTime, Duration } from "chronexa";

const NY = "America/New_York";

// Every Monday standup at 09:30 New York time, whatever the clocks do.
const start = DateTime.fromISO("2025-03-03T09:30:00", { zone: NY });

start.add({ weeks: 2 }).toISO(); // "2025-03-17T09:30:00.000-04:00"  (DST began on the 9th)
start.add({ weeks: 2 }).toZone("Asia/Kolkata").toISO(); // "2025-03-17T19:00:00.000+05:30"

Duration.from({ hours: 1, minutes: 90 }).normalize().toISO(); // "PT2H30M"
