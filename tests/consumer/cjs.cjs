const assert = require("node:assert/strict");
const { DateTime, Duration, ChronexaError } = require("chronexa");

const d = DateTime.fromISO("2025-03-09T01:30:00", { zone: "America/New_York" });
assert.equal(d.add({ hours: 1 }).toISO(), "2025-03-09T03:30:00.000-04:00");
assert.equal(Duration.fromISO("PT90M").normalize().toISO(), "PT1H30M");
assert.throws(() => DateTime.fromISO("2025-02-30"), ChronexaError);
console.log("cjs ok");
