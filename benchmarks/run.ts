/**
 * Reproducible micro-benchmarks: native Date/Intl vs Luxon vs Chronexa on identical inputs.
 *
 *   npm run bench                             # builds, then prints a table
 *   npm run bench -- --markdown               # prints Markdown (used for docs/benchmarks.md)
 *
 * Method: a seeded PRNG builds one dataset (so every library sees the same inputs); each case is
 * warmed up, calibrated so one sample runs ~150 ms, then sampled 9 times; we report the median
 * ops/s and the min–max range. Results are folded into a sink so nothing is optimised away.
 * Semantics differ slightly between libraries (see `note` on each case): treat the numbers as
 * "how long does the equivalent job take", not as a ranking of correctness.
 */
import {
  DateTime as LuxonDateTime,
  Duration as LuxonDuration,
  Interval as LuxonInterval,
} from "luxon";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { BusinessCalendar, DateTime, Duration, Interval } from "../dist/index.js";

const SAMPLES = 9;
const TARGET_MS = 150;
const N = 1000;
const ZONE = "America/New_York";

function prng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = prng(20260101);
const millis = Array.from(
  { length: N },
  () => 946684800000 + Math.floor(rnd() * 1_262_304_000_000),
); // 2000–2039
const isoZ = millis.map((m) => new Date(m).toISOString());
const isoLocal = isoZ.map((s) => s.slice(0, 19));
const comps = millis.map((m) => {
  const d = new Date(m);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: Math.min(d.getUTCDate(), 28),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
});

let sink = 0;
const eat = (v: unknown): void => {
  sink = (sink + (typeof v === "number" ? v : typeof v === "string" ? v.length : v ? 1 : 0)) | 0;
};

interface Result {
  group: string;
  label: string;
  opsPerSec: number;
  min: number;
  max: number;
}
const results: Result[] = [];

function bench(group: string, label: string, fn: (i: number) => unknown): void {
  for (let i = 0; i < 2000; i++) eat(fn(i % N)); // warm-up (JIT + caches)
  let iters = 100;
  for (;;) {
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) eat(fn(i % N));
    const dt = performance.now() - t0;
    if (dt >= TARGET_MS / 3) {
      iters = Math.ceil((iters * TARGET_MS) / dt);
      break;
    }
    iters *= 4;
  }
  const rates: number[] = [];
  for (let s = 0; s < SAMPLES; s++) {
    const t0 = performance.now();
    for (let i = 0; i < iters; i++) eat(fn(i % N));
    rates.push((iters / (performance.now() - t0)) * 1000);
  }
  rates.sort((a, b) => a - b);
  results.push({
    group,
    label,
    opsPerSec: rates[(SAMPLES - 1) / 2]!,
    min: rates[0]!,
    max: rates[SAMPLES - 1]!,
  });
}

// ── 1. construction ─────────────────────────────────────────────────────────
const G1 = "construction from components (America/New_York wall time)";
bench(G1, "native Date.UTC (UTC only; no zone resolution)", (i) =>
  Date.UTC(comps[i]!.year, comps[i]!.month - 1, comps[i]!.day, comps[i]!.hour, comps[i]!.minute),
);
bench(G1, "luxon DateTime.fromObject", (i) =>
  LuxonDateTime.fromObject(comps[i]!, { zone: ZONE }).toMillis(),
);
bench(G1, "chronexa DateTime.fromObject", (i) =>
  DateTime.fromObject(comps[i]!, { zone: ZONE }).toMillis(),
);
const G1b = "construction from epoch milliseconds (UTC)";
bench(G1b, "native new Date(ms)", (i) => new Date(millis[i]!).getTime());
bench(G1b, "luxon DateTime.fromMillis", (i) =>
  LuxonDateTime.fromMillis(millis[i]!, { zone: "utc" }).toMillis(),
);
bench(G1b, "chronexa DateTime.fromMillis", (i) =>
  DateTime.fromMillis(millis[i]!, { zone: "utc" }).toMillis(),
);

// ── 2. ISO parsing ───────────────────────────────────────────────────────────
const G2 = "ISO 8601 parsing ('…Z' strings)";
bench(G2, "native new Date(string) (lenient, non-strict)", (i) => new Date(isoZ[i]!).getTime());
bench(G2, "luxon DateTime.fromISO (zone: utc)", (i) =>
  LuxonDateTime.fromISO(isoZ[i]!, { zone: "utc" }).toMillis(),
);
bench(G2, "chronexa DateTime.fromISO (zone: utc)", (i) =>
  DateTime.fromISO(isoZ[i]!, { zone: "utc" }).toMillis(),
);
const G2b = "ISO 8601 parsing (local wall time in America/New_York)";
bench(G2b, "luxon DateTime.fromISO", (i) =>
  LuxonDateTime.fromISO(isoLocal[i]!, { zone: ZONE }).toMillis(),
);
bench(G2b, "chronexa DateTime.fromISO", (i) =>
  DateTime.fromISO(isoLocal[i]!, { zone: ZONE }).toMillis(),
);

// ── 3. formatting ────────────────────────────────────────────────────────────
const lux = millis.map((m) => LuxonDateTime.fromMillis(m, { zone: ZONE }));
const chr = millis.map((m) => DateTime.fromMillis(m, { zone: ZONE }));
const G3 =
  "formatting 'yyyy-MM-dd HH:mm:ss' in America/New_York (fresh object each time, so field computation is included)";
const nyIso = new Intl.DateTimeFormat("sv-SE", {
  timeZone: ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
bench(G3, "native Intl.DateTimeFormat('sv-SE').format (cached formatter)", (i) =>
  nyIso.format(millis[i]!),
);
bench(G3, "luxon toFormat", (i) =>
  LuxonDateTime.fromMillis(millis[i]!, { zone: ZONE }).toFormat("yyyy-MM-dd HH:mm:ss"),
);
bench(G3, "chronexa format", (i) =>
  DateTime.fromMillis(millis[i]!, { zone: ZONE }).format("yyyy-MM-dd HH:mm:ss"),
);
const G3b = "serialising to ISO 8601 (existing object, fields cached after first call)";
bench(G3b, "native toISOString", (i) => new Date(millis[i]!).toISOString());
bench(G3b, "luxon toISO", (i) => lux[i]!.toISO());
bench(G3b, "chronexa toISO", (i) => chr[i]!.toISO());
const G3c = "locale formatting {dateStyle:'medium', timeStyle:'short'}, en-US, America/New_York";
const nyLocale = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});
bench(G3c, "native Intl.DateTimeFormat (cached)", (i) => nyLocale.format(millis[i]!));
bench(G3c, "luxon toLocaleString", (i) =>
  lux[i]!.toLocaleString(LuxonDateTime.DATETIME_MED, { locale: "en-US" } as never),
);
bench(G3c, "chronexa toLocaleString", (i) =>
  chr[i]!.toLocaleString({ dateStyle: "medium", timeStyle: "short" }, "en-US"),
);

// ── 4. timezone conversion ───────────────────────────────────────────────────
const G4 = "timezone conversion: UTC instant → Asia/Kolkata local hour";
const kolkata = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  hourCycle: "h23",
  hour: "numeric",
});
const luxUtc = millis.map((m) => LuxonDateTime.fromMillis(m, { zone: "utc" }));
const chrUtc = millis.map((m) => DateTime.fromMillis(m, { zone: "utc" }));
bench(G4, "native Intl.DateTimeFormat (cached) → hour string", (i) => kolkata.format(millis[i]!));
bench(G4, "luxon setZone().hour", (i) => luxUtc[i]!.setZone("Asia/Kolkata").hour);
bench(G4, "chronexa toZone().hour", (i) => chrUtc[i]!.toZone("Asia/Kolkata").hour);

// ── 5. arithmetic ────────────────────────────────────────────────────────────
const G5 = "calendar arithmetic: +1 month +3 days +2 hours (America/New_York)";
bench(G5, "native (setMonth/setDate/setHours, local zone of the process)", (i) => {
  const d = new Date(millis[i]!);
  d.setMonth(d.getMonth() + 1);
  d.setDate(d.getDate() + 3);
  d.setHours(d.getHours() + 2);
  return d.getTime();
});
bench(G5, "luxon plus", (i) => lux[i]!.plus({ months: 1, days: 3, hours: 2 }).toMillis());
bench(G5, "chronexa add", (i) => chr[i]!.add({ months: 1, days: 3, hours: 2 }).toMillis());
const G5b = "start of month (America/New_York)";
bench(G5b, "luxon startOf('month')", (i) => lux[i]!.startOf("month").toMillis());
bench(G5b, "chronexa startOf('month')", (i) => chr[i]!.startOf("month").toMillis());
const G5c = "difference in whole days between two instants (America/New_York)";
bench(G5c, "luxon diff(…, 'days')", (i) => lux[(i + 1) % N]!.diff(lux[i]!, "days").days);
bench(G5c, "chronexa diff(…, 'day')", (i) => chr[(i + 1) % N]!.diff(chr[i]!, "day").days);

// ── 6. durations ─────────────────────────────────────────────────────────────
const G6 = "duration: build, add, normalise/shift to hours+minutes";
bench(
  G6,
  "luxon Duration.fromObject().plus().shiftTo()",
  (i) =>
    LuxonDuration.fromObject({ minutes: i, seconds: 90 })
      .plus({ hours: 1 })
      .shiftTo("hours", "minutes").hours,
);
bench(
  G6,
  "chronexa Duration.from().add().shiftTo()",
  (i) =>
    Duration.from({ minutes: i, seconds: 90 }).add({ hours: 1 }).shiftTo(["hour", "minute"]).hours,
);
const G6b = "duration ISO round trip";
bench(G6b, "luxon fromISO().toISO()", (i) => LuxonDuration.fromISO(`PT${i}H30M`).toISO());
bench(G6b, "chronexa fromISO().toISO()", (i) => Duration.fromISO(`PT${i}H30M`).toISO());

// ── 7. intervals ─────────────────────────────────────────────────────────────
const G7 = "interval: build two intervals, overlaps + intersection";
bench(G7, "luxon Interval.fromDateTimes", (i) => {
  const a = LuxonInterval.fromDateTimes(luxUtc[i]!, luxUtc[i]!.plus({ hours: 5 }));
  const b = LuxonInterval.fromDateTimes(
    luxUtc[i]!.plus({ hours: 3 }),
    luxUtc[i]!.plus({ hours: 9 }),
  );
  return a.overlaps(b) && a.intersection(b) !== null;
});
bench(G7, "chronexa Interval.between", (i) => {
  const a = Interval.between(chrUtc[i]!, chrUtc[i]!.add({ hours: 5 }));
  const b = Interval.between(chrUtc[i]!.add({ hours: 3 }), chrUtc[i]!.add({ hours: 9 }));
  return a.overlaps(b) && a.intersection(b) !== null;
});

// ── 8. business days (no Luxon equivalent) ───────────────────────────────────
const G8 = "business days: add 10 / count 90 days (Mon–Fri, UTC)";
const cal = new BusinessCalendar();
bench(G8, "hand-written native loop: add 10 business days", (i) => {
  const d = new Date(millis[i]!);
  let n = 10;
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n--;
  }
  return d.getTime();
});
bench(G8, "chronexa addBusinessDays(10)", (i) => cal.addBusinessDays(chrUtc[i]!, 10).toMillis());
bench(G8, "chronexa countBusinessDays (90-day span)", (i) =>
  cal.countBusinessDays(chrUtc[i]!, chrUtc[i]!.add({ days: 90 })),
);

// ── report ───────────────────────────────────────────────────────────────────
const markdown = process.argv.includes("--markdown");
const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(0);
const env = [
  `node ${process.version} (V8 ${process.versions.v8}), ICU ${process.versions.icu}, tz data ${process.versions.tz}`,
  `${os.type()} ${os.release()} ${os.arch()}, ${os.cpus()[0]?.model ?? "unknown CPU"} × ${os.cpus().length}`,
  `luxon ${(await import("luxon/package.json", { with: { type: "json" } })).default.version}, chronexa ${(await import("../package.json", { with: { type: "json" } })).default.version}`,
  `dataset: ${N} seeded pseudo-random instants (2000–2039); ${SAMPLES} samples of ~${TARGET_MS} ms per case; median ops/s [min–max]`,
];
const groups = [...new Set(results.map((r) => r.group))];
if (markdown) {
  console.log("```text\n" + env.join("\n") + "\n```\n");
  for (const g of groups) {
    console.log(`#### ${g}\n\n| case | ops/s (median) | range |\n|---|---:|---:|`);
    for (const r of results.filter((x) => x.group === g))
      console.log(`| ${r.label} | ${fmt(r.opsPerSec)} | ${fmt(r.min)} – ${fmt(r.max)} |`);
    console.log();
  }
} else {
  console.log(env.join("\n") + "\n");
  for (const g of groups) {
    console.log(g);
    for (const r of results.filter((x) => x.group === g))
      console.log(
        `  ${r.label.padEnd(66)} ${fmt(r.opsPerSec).padStart(8)} ops/s   [${fmt(r.min)} – ${fmt(r.max)}]`,
      );
    console.log();
  }
}
if (sink === 0.5) console.log(sink); // keep `sink` observable
