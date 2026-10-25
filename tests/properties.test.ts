import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DateTime,
  Interval,
  daysInMonth,
  inspectLocalTime,
  type DateTimeUnit,
  type DurationUnit,
} from "../src/index.js";

const ZONES = [
  "utc",
  "America/New_York",
  "Europe/London",
  "Asia/Kolkata",
  "Australia/Lord_Howe",
  "Pacific/Apia",
  "America/Sao_Paulo",
  "Asia/Kathmandu",
  "+05:45",
  "-03:30",
];
const zoneArb = fc.constantFrom(...ZONES);
// 1906 – 2128, comfortably inside the named-zone range
const msArb = fc.integer({ min: -2_000_000_000_000, max: 5_000_000_000_000 });
const dtArb = fc
  .record({ ms: msArb, zone: zoneArb })
  .map(({ ms, zone }) => DateTime.fromMillis(ms, { zone, locale: "en-US" }));
const utcArb = msArb.map((ms) => DateTime.fromMillis(ms, { zone: "utc" }));
// FC_NUM_RUNS=5000 npx vitest run tests/properties.test.ts for a deeper soak
const runs = { numRuns: Number(process.env.FC_NUM_RUNS ?? 300) };

const UNITS: DateTimeUnit[] = [
  "year",
  "quarter",
  "month",
  "week",
  "day",
  "hour",
  "minute",
  "second",
  "millisecond",
];

describe("instants and immutability", () => {
  it("adding a zero duration preserves the instant", () => {
    fc.assert(
      fc.property(dtArb, (d) => {
        expect(d.add({ days: 0, months: 0, hours: 0 }).toMillis()).toBe(d.toMillis());
        expect(d.add({}).toMillis()).toBe(d.toMillis());
        expect(d.subtract({ weeks: 0, seconds: 0 }).toMillis()).toBe(d.toMillis());
      }),
      runs,
    );
  });

  it("operations never modify the original", () => {
    fc.assert(
      fc.property(
        dtArb,
        fc.integer({ min: -400, max: 400 }),
        fc.constantFrom(...UNITS),
        (d, n, unit) => {
          const before = [
            d.toMillis(),
            d.toISO(),
            d.zone.name,
            d.year,
            d.month,
            d.day,
            d.hour,
            d.offset,
          ];
          d.add({ days: n, months: n, hours: n });
          d.subtract({ years: n });
          d.startOf(unit);
          d.endOf(unit);
          d.toZone("Asia/Tokyo");
          d.format("yyyy-MM-dd HH:mm:ss ZZ");
          expect([
            d.toMillis(),
            d.toISO(),
            d.zone.name,
            d.year,
            d.month,
            d.day,
            d.hour,
            d.offset,
          ]).toEqual(before);
        },
      ),
      runs,
    );
  });

  it("toISO → fromISO preserves the instant (any zone, incl. odd offsets)", () => {
    fc.assert(
      fc.property(dtArb, (d) => {
        expect(DateTime.fromISO(d.toISO()).toMillis()).toBe(d.toMillis());
        expect(DateTime.fromISO(d.toISO({ format: "basic" })).toMillis()).toBe(d.toMillis());
        expect(DateTime.fromISO(d.toISO(), { setZone: true }).offset).toBe(d.offset);
      }),
      runs,
    );
  });

  it("format → fromFormat preserves the instant when an offset is included", () => {
    fc.assert(
      fc.property(dtArb, (d) => {
        const text = d.format("yyyy-MM-dd HH:mm:ss.SSS ZZ");
        expect(
          DateTime.fromFormat(text, "yyyy-MM-dd HH:mm:ss.SSS ZZ", { zone: "utc" }).toMillis(),
        ).toBe(d.toMillis());
      }),
      runs,
    );
  });

  it("fields agree with Intl for named zones", () => {
    fc.assert(
      fc.property(
        msArb,
        fc.constantFrom(...ZONES.filter((z) => !/^[+-]/.test(z) && z !== "utc")),
        (ms, zone) => {
          const intl = new Intl.DateTimeFormat("sv-SE", {
            timeZone: zone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hourCycle: "h23",
          }).format(ms);
          expect(DateTime.fromMillis(ms, { zone }).format("yyyy-MM-dd HH:mm:ss")).toBe(intl);
        },
      ),
      runs,
    );
  });

  it("local components round-trip unless the wall time falls in a gap", () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 1950, max: 2100 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 1, max: 28 }),
          hour: fc.integer({ min: 0, max: 23 }),
          minute: fc.integer({ min: 0, max: 59 }),
        }),
        zoneArb,
        (c, zone) => {
          const report = inspectLocalTime(c, zone);
          if (report.status === "gap") {
            expect(() => DateTime.fromObject(c, { zone, disambiguation: "reject" })).toThrow();
            return;
          }
          const d = DateTime.fromObject(c, { zone, disambiguation: "earlier" });
          expect(d.toObject()).toMatchObject(c);
          expect(report.candidates.map((x) => x.toObject())).toSatisfy((list: object[]) =>
            list.every((o) => JSON.stringify(o) === JSON.stringify(d.toObject())),
          );
        },
      ),
      runs,
    );
  });
});

describe("comparison", () => {
  it("compare is antisymmetric, transitive and consistent with the operators", () => {
    fc.assert(
      fc.property(dtArb, dtArb, dtArb, (a, b, c) => {
        expect(a.compare(b)).toBe(-b.compare(a) === 0 ? 0 : -b.compare(a));
        expect(a.compare(a)).toBe(0);
        expect(a.isBefore(b)).toBe(a.compare(b) === -1);
        expect(a.isAfter(b)).toBe(a.compare(b) === 1);
        expect(a.equals(b)).toBe(a.compare(b) === 0);
        if (a.compare(b) <= 0 && b.compare(c) <= 0) expect(a.compare(c)).toBeLessThanOrEqual(0);
        expect(a < b).toBe(a.isBefore(b));
      }),
      runs,
    );
  });
});

describe("calendar arithmetic", () => {
  it("days/weeks add and subtract exactly in zones without gaps (UTC)", () => {
    fc.assert(
      fc.property(utcArb, fc.integer({ min: -5000, max: 5000 }), (d, n) => {
        expect(d.add({ days: n }).subtract({ days: n }).toMillis()).toBe(d.toMillis());
        expect(d.add({ weeks: n }).toMillis()).toBe(d.add({ days: 7 * n }).toMillis());
        expect(d.add({ days: n }).toMillis() - d.toMillis()).toBe(n * 86_400_000);
      }),
      runs,
    );
  });

  it("adding months lands in the right month with the day clamped to month end", () => {
    fc.assert(
      fc.property(utcArb, fc.integer({ min: -1200, max: 1200 }), (d, n) => {
        const r = d.add({ months: n });
        const total = d.year * 12 + (d.month - 1) + n;
        expect(r.year * 12 + (r.month - 1)).toBe(total);
        expect(r.day).toBe(Math.min(d.day, daysInMonth(r.year, r.month)));
        expect([r.hour, r.minute, r.second, r.millisecond]).toEqual([
          d.hour,
          d.minute,
          d.second,
          d.millisecond,
        ]);
      }),
      runs,
    );
  });

  it("elapsed units add exactly in any zone", () => {
    fc.assert(
      fc.property(dtArb, fc.integer({ min: -100_000, max: 100_000 }), (d, h) => {
        expect(d.add({ hours: h }).elapsed(d, "hour")).toBe(h);
        expect(d.add({ minutes: h }).toMillis() - d.toMillis()).toBe(h * 60_000);
      }),
      runs,
    );
  });

  it("calendar days keep the wall-clock time unless that time does not exist", () => {
    fc.assert(
      fc.property(dtArb, fc.integer({ min: -400, max: 400 }), (d, n) => {
        const r = d.add({ days: n });
        // The intended wall time is the original one on the shifted date, not the resolved result.
        const target = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
        const intended = {
          year: target.getUTCFullYear(),
          month: target.getUTCMonth() + 1,
          day: target.getUTCDate(),
          hour: d.hour,
          minute: d.minute,
          second: d.second,
          millisecond: d.millisecond,
        };
        const gap = inspectLocalTime(intended, d.zone).status === "gap";
        if (!gap) expect([r.hour, r.minute]).toEqual([d.hour, d.minute]);
        expect(r.zone.equals(d.zone)).toBe(true);
      }),
      runs,
    );
  });

  it("diff round-trips forward: earlier + (later − earlier) = later, in any zone", () => {
    const units: DurationUnit[] = [
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
      "millisecond",
    ];
    fc.assert(
      fc.property(dtArb, dtArb, (x, y) => {
        // measured on the wall clock of the receiver, so view both ends in one zone
        const [lo, hi] =
          x.toMillis() <= y.toMillis() ? [x, y.toZone(x.zone)] : [y, x.toZone(y.zone)];
        const d = hi.diff(lo, units);
        expect(lo.add(d).toMillis()).toBe(hi.toMillis());
        // and the reverse call is the exact negation (it measures from the same earlier instant)
        expect(lo.diff(hi, units).toObject()).toEqual(
          Object.fromEntries(Object.entries(d.toObject()).map(([k, v]) => [k, -(v as number)])),
        );
      }),
      { numRuns: 300 },
    );
  });

  it("startOf/endOf bracket the instant and are idempotent", () => {
    fc.assert(
      fc.property(dtArb, fc.constantFrom(...UNITS), (d, unit) => {
        const s = d.startOf(unit);
        const e = d.endOf(unit);
        expect(s.toMillis()).toBeLessThanOrEqual(d.toMillis());
        expect(e.toMillis()).toBeGreaterThanOrEqual(d.toMillis());
        expect(s.startOf(unit).toMillis()).toBe(s.toMillis());
        expect(e.endOf(unit).toMillis()).toBe(e.toMillis());
        expect(d.isSame(s, unit)).toBe(true);
        expect(d.isSame(e, unit)).toBe(true);
        // the millisecond after the end belongs to the next unit
        if (unit !== "millisecond") expect(e.add({ milliseconds: 1 }).isSame(d, unit)).toBe(false);
      }),
      runs,
    );
  });

  it("calendarDiff is antisymmetric and zero against itself", () => {
    fc.assert(
      fc.property(
        dtArb,
        dtArb,
        fc.constantFrom("year", "quarter", "month", "week", "day" as const),
        (a, b, unit) => {
          expect(a.calendarDiff(b, unit)).toBe(-b.toZone(a.zone).calendarDiff(a, unit) || 0);
          expect(a.calendarDiff(a, unit)).toBe(0);
        },
      ),
      runs,
    );
  });
});

describe("intervals", () => {
  const ivArb = fc
    .tuple(msArb, fc.integer({ min: 0, max: 10_000_000_000 }))
    .map(([s, len]) =>
      Interval.between(
        DateTime.fromMillis(s, { zone: "utc" }),
        DateTime.fromMillis(s + len, { zone: "utc" }),
      ),
    );

  it("an intersection lies within both inputs", () => {
    fc.assert(
      fc.property(ivArb, ivArb, (a, b) => {
        const x = a.intersection(b);
        expect(x !== null).toBe(a.overlaps(b));
        if (x) {
          expect(a.engulfs(x)).toBe(true);
          expect(b.engulfs(x)).toBe(true);
          expect(x.isEmpty).toBe(false);
        }
        expect(a.overlaps(b)).toBe(b.overlaps(a));
        expect(a.intersection(b)?.equals(b.intersection(a)!) ?? true).toBe(true);
      }),
      runs,
    );
  });

  it("union and gap are consistent", () => {
    fc.assert(
      fc.property(ivArb, ivArb, (a, b) => {
        const u = a.union(b);
        const g = a.gap(b);
        if (u && !a.isEmpty && !b.isEmpty) {
          expect(u.engulfs(a) && u.engulfs(b)).toBe(true);
          expect(g).toBeNull();
        }
        if (g) {
          expect(g.isEmpty).toBe(false);
          expect(a.overlaps(g) || b.overlaps(g)).toBe(false);
        }
      }),
      runs,
    );
  });

  it("merge yields sorted, disjoint, non-adjacent intervals covering the same instants", () => {
    fc.assert(
      fc.property(
        fc.array(ivArb, { maxLength: 8 }),
        fc.array(msArb, { maxLength: 8 }),
        (list, probes) => {
          const merged = Interval.merge(list);
          for (let i = 1; i < merged.length; i++) {
            expect(merged[i - 1]!.end.toMillis()).toBeLessThan(merged[i]!.start.toMillis());
          }
          for (const ms of [
            ...probes,
            ...list.map((i) => i.start.toMillis()),
            ...list.map((i) => i.end.toMillis()),
          ]) {
            const t = DateTime.fromMillis(ms, { zone: "utc" });
            expect(merged.some((m) => m.contains(t))).toBe(list.some((i) => i.contains(t)));
          }
        },
      ),
      runs,
    );
  });

  it("subtract and splitAt partition the interval", () => {
    fc.assert(
      fc.property(ivArb, ivArb, msArb, (a, b, cut) => {
        const total = (xs: Interval[]) => xs.reduce((n, x) => n + x.length(), 0);
        const rest = a.subtract(b);
        const inter = a.intersection(b);
        expect(total(rest) + (inter?.length() ?? 0)).toBe(a.length());
        const parts = a.splitAt(DateTime.fromMillis(cut, { zone: "utc" }));
        expect(total(parts)).toBe(a.length());
        expect(a.isEmpty || parts.every((p) => a.engulfs(p))).toBe(true);
      }),
      runs,
    );
  });
});
