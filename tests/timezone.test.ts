import { describe, expect, it } from "vitest";
import {
  ChronexaError,
  DateTime,
  Zone,
  inspectLocalTime,
  nextTransition,
  resolveLocalTime,
} from "../src/index.js";

const NY = "America/New_York";
const at = (s: string, zone: string, extra = {}) => DateTime.fromISO(s, { zone, ...extra });

describe("zones", () => {
  it("distinguishes utc, fixed offsets and IANA zones", () => {
    expect(Zone.utc.kind).toBe("utc");
    expect(Zone.from("UTC")).toBe(Zone.utc);
    expect(Zone.from("Etc/UTC")).toBe(Zone.utc);
    expect(Zone.from("+05:30").kind).toBe("fixed");
    expect(Zone.from("+05:30").name).toBe("+05:30");
    expect(Zone.from("UTC-8").name).toBe("-08:00");
    expect(Zone.from("-0800").equals(Zone.fixedOffset(-480))).toBe(true);
    expect(Zone.from(NY).kind).toBe("iana");
    // a fixed offset is not the IANA zone that currently uses it
    expect(Zone.fixedOffset(-300).equals(Zone.from(NY))).toBe(false);
    expect(Zone.from(NY).isFixedOffset).toBe(false);
  });

  it("keeps the identifier used by the caller and equates aliases", () => {
    expect(Zone.from("Asia/Kolkata").name).toBe("Asia/Kolkata");
    expect(Zone.from("america/new_york").name).toBe("America/New_York");
    expect(Zone.from("Asia/Kolkata").equals(Zone.from("Asia/Calcutta"))).toBe(true);
  });

  it.each(["", "Mars/Olympus", "America/Gotham", "EST5EDTX", "+25:00", "UTC+30"])(
    "rejects %j",
    (id) => {
      expect(() => Zone.from(id)).toThrow(ChronexaError);
      expect(Zone.isValid(id)).toBe(false);
    },
  );

  it("reports InvalidZone with a helpful message", () => {
    try {
      Zone.iana("Nope/Nowhere");
      expect.unreachable();
    } catch (e) {
      expect((e as ChronexaError).code).toBe("INVALID_ZONE");
      expect((e as Error).message).toMatch(/IANA identifier/);
    }
    expect(() => Zone.fixedOffset(1440)).toThrow(/strictly between/);
    expect(() => Zone.fixedOffset(1.5)).toThrow(/whole number/);
  });

  it("provides names", () => {
    const d = at("2024-07-01T12:00:00", NY);
    expect(d.zone.abbreviationAt(d.toMillis(), "en-US")).toBe("EDT");
    expect(d.zone.longNameAt(d.toMillis(), "en-US")).toBe("Eastern Daylight Time");
    expect(Zone.fixedOffset(330).abbreviationAt(0)).toBe("UTC+5:30");
  });
});

describe("conversion", () => {
  it("converts the same instant between zones", () => {
    const utc = at("2024-06-15T12:00:00Z", "utc");
    expect(utc.toZone(NY).toISO()).toBe("2024-06-15T08:00:00.000-04:00");
    expect(utc.toZone("Asia/Kolkata").toISO()).toBe("2024-06-15T17:30:00.000+05:30");
    expect(utc.toZone("Asia/Kathmandu").toISO()).toBe("2024-06-15T17:45:00.000+05:45");
    expect(utc.toZone("Australia/Lord_Howe").toISO()).toBe("2024-06-15T22:30:00.000+10:30");
    expect(utc.toZone("Pacific/Kiritimati").toISO()).toBe("2024-06-16T02:00:00.000+14:00");
    expect(utc.toZone("+02:00").toISO()).toBe("2024-06-15T14:00:00.000+02:00");
    expect(utc.toZone(NY).toMillis()).toBe(utc.toMillis());
    expect(utc.toZone(NY).offset).toBe(-240);
    expect(utc.toZone("Asia/Kathmandu").offset).toBe(345);
  });

  it("uses historical offsets from the runtime tz database", () => {
    expect(at("2005-01-01T00:00:00Z", "Europe/Moscow").offset).toBe(180);
    expect(at("2012-01-01T00:00:00Z", "Europe/Moscow").offset).toBe(240);
    expect(at("2020-01-01T00:00:00Z", "Europe/Moscow").offset).toBe(180);
  });

  it("setZone keeps the written offset as a fixed zone", () => {
    const d = DateTime.fromISO("2024-06-15T12:00:00+02:00", { setZone: true });
    expect(d.zone.kind).toBe("fixed");
    expect(d.hour).toBe(12);
    expect(DateTime.fromISO("2024-06-15T12:00:00Z", { setZone: true }).zone.kind).toBe("utc");
    const converted = DateTime.fromISO("2024-06-15T12:00:00+02:00", { zone: NY });
    expect(converted.zone.name).toBe(NY);
    expect(converted.hour).toBe(6);
  });

  it("interprets offset-less text as wall time in the given zone", () => {
    expect(at("2024-01-15T09:00:00", NY).toUTC().toISO()).toBe("2024-01-15T14:00:00.000Z");
    expect(at("2024-07-15T09:00:00", NY).toUTC().toISO()).toBe("2024-07-15T13:00:00.000Z");
  });

  it("formats in the zone (Intl) and with fixed offsets", () => {
    const d = at("2024-06-15T12:00:00Z", "utc");
    expect(
      d.toZone("Asia/Tokyo").toLocaleString({ dateStyle: "short", timeStyle: "short" }, "en-US"),
    ).toBe("6/15/24, 9:00 PM");
    expect(
      d.toZone("+02:00").toLocaleString({ dateStyle: "short", timeStyle: "short" }, "en-US"),
    ).toBe("6/15/24, 2:00 PM");
    expect(() => d.toLocaleString({ timeZone: "UTC" })).toThrow(/toZone/);
    expect(() => d.toZone("+02:00").toLocaleString({ timeZoneName: "short" })).toThrow(
      /fixed-offset/,
    );
    expect(
      d.toZone(NY).toLocaleString({ hour: "numeric", timeZoneName: "short" }, "en-US"),
    ).toMatch(/8\s?AM EDT/);
  });

  it("limits named zones to years 1–9999 with a clear error", () => {
    const far = DateTime.fromObject({ year: 12000 }, { zone: "utc" });
    expect(() => far.toZone(NY).year).toThrow(/years 1 through 9999/);
    expect(far.toZone("+01:00").year).toBe(12000);
  });
});

describe("DST spring-forward (America/New_York, 2025-03-09 02:00 → 03:00)", () => {
  it("reports the gap", () => {
    const r = inspectLocalTime({ year: 2025, month: 3, day: 9, hour: 2, minute: 30 }, NY);
    expect(r.status).toBe("gap");
    expect(r.candidates).toEqual([]);
    expect(r.gap).toEqual({
      offsetBeforeMinutes: -300,
      offsetAfterMinutes: -240,
      lengthMinutes: 60,
    });
    expect(r.resolved.compatible.toISO()).toBe("2025-03-09T03:30:00.000-04:00");
    expect(r.resolved.later.toISO()).toBe("2025-03-09T03:30:00.000-04:00");
    expect(r.resolved.earlier.toISO()).toBe("2025-03-09T01:30:00.000-05:00");
  });

  it("fromObject honours disambiguation in the gap", () => {
    const c = { year: 2025, month: 3, day: 9, hour: 2, minute: 30 };
    expect(DateTime.fromObject(c, { zone: NY }).toISO()).toBe("2025-03-09T03:30:00.000-04:00");
    expect(DateTime.fromObject(c, { zone: NY, disambiguation: "earlier" }).hour).toBe(1);
    expect(() => DateTime.fromObject(c, { zone: NY, disambiguation: "reject" })).toThrow(
      /does not exist/,
    );
    expect(() => resolveLocalTime(c, NY)).toThrow(ChronexaError);
  });

  it("boundaries are exact", () => {
    expect(at("2025-03-09T01:59:59.999", NY).toISO()).toBe("2025-03-09T01:59:59.999-05:00");
    expect(at("2025-03-09T03:00:00", NY).toISO()).toBe("2025-03-09T03:00:00.000-04:00");
    expect(inspectLocalTime({ year: 2025, month: 3, day: 9, hour: 2 }, NY).status).toBe("gap");
    expect(inspectLocalTime({ year: 2025, month: 3, day: 9, hour: 3 }, NY).status).toBe("unique");
    expect(
      inspectLocalTime(
        { year: 2025, month: 3, day: 9, hour: 1, minute: 59, second: 59, millisecond: 999 },
        NY,
      ).status,
    ).toBe("unique");
  });

  it("elapsed arithmetic crosses the gap in real time, calendar arithmetic keeps the wall clock", () => {
    const start = at("2025-03-09T01:30:00", NY);
    expect(start.add({ hours: 1 }).toISO()).toBe("2025-03-09T03:30:00.000-04:00");
    expect(start.add({ days: 1 }).toISO()).toBe("2025-03-10T01:30:00.000-04:00");
    expect(at("2025-03-08T02:30:00", NY).add({ days: 1 }).toISO()).toBe(
      "2025-03-09T03:30:00.000-04:00",
    ); // lands in gap → compatible
    expect(() =>
      at("2025-03-08T02:30:00", NY).add({ days: 1 }, { disambiguation: "reject" }),
    ).toThrow(/does not exist/);
  });

  it("the day is 23 hours long", () => {
    const s = at("2025-03-09T00:00:00", NY);
    expect(s.endOf("day").toISO()).toBe("2025-03-09T23:59:59.999-04:00");
    expect(s.endOf("day").elapsed(s, "hour")).toBeCloseTo(23, 2);
  });

  it("fromFormat and fromISO follow the same policy", () => {
    expect(DateTime.fromFormat("2025-03-09 02:30", "yyyy-MM-dd HH:mm", { zone: NY }).hour).toBe(3);
    expect(() =>
      DateTime.fromISO("2025-03-09T02:30:00", { zone: NY, disambiguation: "reject" }),
    ).toThrow(/does not exist/);
  });

  it("midnight that does not exist moves startOf('day') forward (Havana-style gap)", () => {
    // America/Havana springs forward at 00:00 → 01:00 (2025-03-09)
    const d = at("2025-03-09T12:00:00", "America/Havana");
    expect(d.startOf("day").hour).toBe(1);
  });
});

describe("DST fall-back (America/New_York, 2025-11-02 02:00 → 01:00)", () => {
  const c = { year: 2025, month: 11, day: 2, hour: 1, minute: 30 };

  it("reports the overlap with both instants", () => {
    const r = inspectLocalTime(c, NY);
    expect(r.status).toBe("ambiguous");
    expect(r.candidates.map((d) => d.toISO())).toEqual([
      "2025-11-02T01:30:00.000-04:00",
      "2025-11-02T01:30:00.000-05:00",
    ]);
    expect(r.resolved.compatible.offset).toBe(-240);
    expect(r.resolved.earlier.offset).toBe(-240);
    expect(r.resolved.later.offset).toBe(-300);
  });

  it("fromObject honours disambiguation in the overlap", () => {
    expect(DateTime.fromObject(c, { zone: NY }).offset).toBe(-240);
    expect(DateTime.fromObject(c, { zone: NY, disambiguation: "later" }).offset).toBe(-300);
    expect(() => DateTime.fromObject(c, { zone: NY, disambiguation: "reject" })).toThrow(
      /occurs twice/,
    );
    expect(() => resolveLocalTime(c, NY)).toThrow(/occurs twice/);
    expect(resolveLocalTime(c, NY, { disambiguation: "later" }).offset).toBe(-300);
  });

  it("an hour is added in real time and passes through the repeated hour", () => {
    const first = DateTime.fromObject(c, { zone: NY });
    const second = first.add({ hours: 1 });
    expect(second.toISO()).toBe("2025-11-02T01:30:00.000-05:00");
    expect(second.hour).toBe(1);
    expect(first.add({ hours: 2 }).toISO()).toBe("2025-11-02T02:30:00.000-05:00");
  });

  it("calendar arithmetic does not jump between the two occurrences", () => {
    const later = DateTime.fromObject(c, { zone: NY, disambiguation: "later" });
    expect(later.add({ days: 0 })).toBe(later);
    expect(later.set({ minute: 45 }).offset).toBe(-300);
    expect(later.startOf("hour").offset).toBe(-300);
    expect(later.startOf("hour").toISO()).toBe("2025-11-02T01:00:00.000-05:00");
    expect(later.endOf("hour").toISO()).toBe("2025-11-02T01:59:59.999-05:00");
    expect(later.toISO()).toBe("2025-11-02T01:30:00.000-05:00");
  });

  it("the day is 25 hours long", () => {
    const s = at("2025-11-02T00:00:00", NY);
    const next = at("2025-11-03T00:00:00", NY);
    expect(next.elapsed(s, "hour")).toBe(25);
    expect(next.diff(s, "day").days).toBe(1);
    expect(s.add({ days: 1 }).toISO()).toBe("2025-11-03T00:00:00.000-05:00");
  });
});

describe("other DST shapes", () => {
  it("Europe/London spring-forward gap is 01:00–02:00 local", () => {
    const r = inspectLocalTime(
      { year: 2025, month: 3, day: 30, hour: 1, minute: 30 },
      "Europe/London",
    );
    expect(r.status).toBe("gap");
    expect(r.resolved.compatible.toISO()).toBe("2025-03-30T02:30:00.000+01:00");
    expect(
      inspectLocalTime({ year: 2025, month: 10, day: 26, hour: 1, minute: 30 }, "Europe/London")
        .status,
    ).toBe("ambiguous");
  });

  it("Australia/Lord_Howe has a 30-minute DST shift", () => {
    const r = inspectLocalTime(
      { year: 2025, month: 10, day: 5, hour: 2, minute: 15 },
      "Australia/Lord_Howe",
    );
    expect(r.status).toBe("gap");
    expect(r.gap?.lengthMinutes).toBe(30);
    const back = inspectLocalTime(
      { year: 2025, month: 4, day: 6, hour: 1, minute: 45 },
      "Australia/Lord_Howe",
    );
    expect(back.status).toBe("ambiguous");
    expect(back.candidates[1]!.toMillis() - back.candidates[0]!.toMillis()).toBe(30 * 60_000);
  });

  it("southern hemisphere zones are in DST during northern winter", () => {
    expect(at("2025-01-15T12:00:00", "Australia/Sydney").isInDST).toBe(true);
    expect(at("2025-07-15T12:00:00", "Australia/Sydney").isInDST).toBe(false);
    expect(at("2025-07-15T12:00:00", NY).isInDST).toBe(true);
    expect(at("2025-01-15T12:00:00", NY).isInDST).toBe(false);
    expect(at("2025-07-15T12:00:00", "Asia/Kolkata").isInDST).toBe(false);
    expect(at("2025-07-15T12:00:00", "utc").isInDST).toBe(false);
  });

  it("Pacific/Apia skipped 2011-12-30 entirely", () => {
    const r = inspectLocalTime({ year: 2011, month: 12, day: 30, hour: 12 }, "Pacific/Apia");
    expect(r.status).toBe("gap");
    expect(r.gap?.lengthMinutes).toBe(24 * 60);
    const before = at("2011-12-29T12:00:00", "Pacific/Apia");
    const after = at("2011-12-31T12:00:00", "Pacific/Apia");
    expect(after.toMillis() - before.toMillis()).toBe(24 * 3_600_000); // 2 calendar days, 24 real hours
    expect(after.diff(before, "day").days).toBe(2);
    expect(after.calendarDiff(before, "day")).toBe(2);
  });

  it("zones without DST never report transitions", () => {
    expect(nextTransition("Asia/Kolkata", at("2025-01-01T00:00:00Z", "utc"))).toBeNull();
    expect(nextTransition("utc", at("2025-01-01T00:00:00Z", "utc"))).toBeNull();
    expect(nextTransition("+02:00", at("2025-01-01T00:00:00Z", "utc"))).toBeNull();
  });

  it("finds the next transition to the millisecond", () => {
    const t = nextTransition(NY, at("2025-01-01T00:00:00", NY))!;
    expect(t.at.toISO()).toBe("2025-03-09T03:00:00.000-04:00");
    expect(t.at.toUTC().toISO()).toBe("2025-03-09T07:00:00.000Z");
    expect([t.offsetBeforeMinutes, t.offsetAfterMinutes]).toEqual([-300, -240]);
    const t2 = nextTransition(NY, t.at)!;
    expect(t2.at.toUTC().toISO()).toBe("2025-11-02T06:00:00.000Z");
    expect([t2.offsetBeforeMinutes, t2.offsetAfterMinutes]).toEqual([-240, -300]);
    expect(nextTransition(NY, at("2025-01-01T00:00:00", NY), 30)).toBeNull();
  });
});

describe("skipped local midnight (historical gap)", () => {
  // Asia/Kolkata moved from +05:21:10 to +05:30 at local midnight 1906-01-01, so 00:00–00:08:50 never happened.
  const z = "Asia/Kolkata";
  it("startOf moves forward past the gap and endOf stays inside the unit", () => {
    const d = DateTime.fromISO("1906-12-31T23:59:59.999+05:30", { zone: z });
    expect(d.startOf("year").toISO()).toBe("1906-01-01T00:08:50.000+05:30");
    expect(d.endOf("year").toISO()).toBe("1906-12-31T23:59:59.999+05:30");
    expect(d.endOf("year").endOf("year").toMillis()).toBe(d.endOf("year").toMillis());
    expect(d.endOf("year").add({ milliseconds: 1 }).toISO()).toBe("1907-01-01T00:00:00.000+05:30");
    expect(d.endOf("year").isSame(d, "year")).toBe(true);
  });
});

describe("exhaustive local-time resolution against a brute-force oracle", () => {
  // For each zone/window, walk every real instant in 15-minute steps, record which wall times it shows,
  // and check inspectLocalTime / disambiguation for EVERY 15-minute wall time in the window.
  const cases: [string, string, string][] = [
    ["America/New_York", "2025-01-01", "2026-01-01"],
    ["Europe/London", "2025-01-01", "2026-01-01"],
    ["Australia/Lord_Howe", "2025-01-01", "2026-01-01"],
    ["America/Sao_Paulo", "2018-01-01", "2019-01-01"], // DST began at local midnight
    ["Pacific/Apia", "2011-12-01", "2012-02-01"], // skipped a whole day
    ["Asia/Kolkata", "2025-01-01", "2025-07-01"], // no transitions
  ];
  const STEP = 15 * 60_000;

  it.each(cases)("%s %s…%s", (zoneName, from, to) => {
    const zone = Zone.from(zoneName);
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    const byWall = new Map<number, number[]>();
    for (let t = start; t < end; t += STEP) {
      const wall = t + zone.offsetAt(t);
      const list = byWall.get(wall);
      if (list) list.push(t);
      else byWall.set(wall, [t]);
    }
    let gaps = 0;
    let overlaps = 0;
    // keep wall times well inside the oracle's instant range (offsets reach ±14 h)
    for (let wall = start + 30 * 3_600_000; wall < end - 30 * 3_600_000; wall += STEP) {
      const expected = byWall.get(wall) ?? [];
      const got = zone.inspectLocal(wall);
      expect(got.instants).toEqual(expected);
      const status = expected.length === 0 ? "gap" : expected.length === 1 ? "unique" : "ambiguous";
      expect(got.status).toBe(status);
      if (status === "gap") {
        gaps++;
        const compat = zone.resolveLocal(wall, "compatible");
        // shifted forward: lands after the transition, and no earlier than the wall time shifted by the gap
        expect(compat + zone.offsetAt(compat)).toBeGreaterThanOrEqual(wall);
        expect(() => zone.resolveLocal(wall, "reject")).toThrow(ChronexaError);
        expect(
          zone.resolveLocal(wall, "earlier") + zone.offsetAt(zone.resolveLocal(wall, "earlier")),
        ).toBeLessThan(wall);
      } else if (status === "ambiguous") {
        overlaps++;
        expect(zone.resolveLocal(wall, "earlier")).toBe(expected[0]);
        expect(zone.resolveLocal(wall, "compatible")).toBe(expected[0]);
        expect(zone.resolveLocal(wall, "later")).toBe(expected[1]);
        expect(() => zone.resolveLocal(wall, "reject")).toThrow(ChronexaError);
      } else {
        for (const d of ["compatible", "earlier", "later", "reject"] as const) {
          expect(zone.resolveLocal(wall, d)).toBe(expected[0]);
        }
      }
    }
    // sanity: the oracle really saw the transitions we expect in these windows
    const expectedGaps = {
      "America/New_York": 4,
      "Europe/London": 4,
      "Australia/Lord_Howe": 2,
      "America/Sao_Paulo": 4,
      "Pacific/Apia": 96,
      "Asia/Kolkata": 0,
    }[zoneName]!;
    const expectedOverlaps = {
      "America/New_York": 4,
      "Europe/London": 4,
      "Australia/Lord_Howe": 2,
      "America/Sao_Paulo": 4,
      "Pacific/Apia": 0,
      "Asia/Kolkata": 0,
    }[zoneName]!;
    expect(gaps).toBe(expectedGaps);
    expect(overlaps).toBe(expectedOverlaps);
  });
});
