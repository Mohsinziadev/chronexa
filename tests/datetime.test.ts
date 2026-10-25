import { afterEach, describe, expect, it } from "vitest";
import { ChronexaError, DateTime, Duration, Settings } from "../src/index.js";

const NY = "America/New_York";
const iso = (d: DateTime) => d.toISO();

afterEach(() => Settings.reset());

describe("construction", () => {
  it("fromMillis / fromSeconds / fromJSDate describe the same instant", () => {
    const ms = Date.UTC(2024, 1, 29, 12, 34, 56, 789);
    const a = DateTime.fromMillis(ms, { zone: "utc" });
    expect(a.toMillis()).toBe(ms);
    expect(a.toSeconds()).toBe(Math.floor(ms / 1000));
    expect(DateTime.fromSeconds(1709210096.789, { zone: "utc" }).toMillis()).toBe(ms);
    expect(DateTime.fromJSDate(new Date(ms), { zone: "utc" }).equals(a)).toBe(true);
    expect(a.toJSDate().getTime()).toBe(ms);
  });

  it("fromObject builds wall time in the requested zone", () => {
    const d = DateTime.fromObject(
      { year: 2024, month: 7, day: 4, hour: 9, minute: 30 },
      { zone: NY },
    );
    expect(iso(d)).toBe("2024-07-04T09:30:00.000-04:00");
    expect(d.toObject()).toEqual({
      year: 2024,
      month: 7,
      day: 4,
      hour: 9,
      minute: 30,
      second: 0,
      millisecond: 0,
    });
  });

  it("defaults missing components to their minimum", () => {
    expect(iso(DateTime.fromObject({ year: 2024 }, { zone: "utc" }))).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  it("now() uses the injectable clock", () => {
    Settings.now = () => Date.UTC(2020, 0, 1);
    expect(iso(DateTime.now({ zone: "utc" }))).toBe("2020-01-01T00:00:00.000Z");
    expect(Settings.withNow(Date.UTC(2021, 5, 6), () => DateTime.now({ zone: "utc" }).year)).toBe(
      2021,
    );
    expect(DateTime.now({ zone: "utc" }).year).toBe(2020);
  });

  it("Settings.defaultZone applies when no zone is passed", () => {
    Settings.defaultZone = "Asia/Tokyo";
    expect(DateTime.fromMillis(0).zone.name).toBe("Asia/Tokyo");
    expect(DateTime.fromMillis(0, { zone: "utc" }).zone.name).toBe("UTC");
  });

  it("exposes calendar fields", () => {
    const d = DateTime.fromISO("2024-12-30T10:00:00", { zone: "utc" });
    expect(d).toMatchObject({
      year: 2024,
      month: 12,
      day: 30,
      hour: 10,
      weekday: 1,
      ordinal: 365,
      quarter: 4,
    });
    expect(d.weekYear).toBe(2025);
    expect(d.weekNumber).toBe(1);
    expect(d.isLeapYear).toBe(true);
    expect(d.daysInMonth).toBe(31);
    expect(d.daysInYear).toBe(366);
  });
});

describe("invalid input", () => {
  it.each([
    [{ year: 2024, month: 2, day: 30 }, /does not exist in 2024-02/],
    [{ year: 2023, month: 2, day: 29 }, /does not exist in 2023-02/],
    [{ year: 2024, month: 13 }, /month must be between 1 and 12/],
    [{ year: 2024, month: 0 }, /month must be between 1 and 12/],
    [{ year: 2024, hour: 24 }, /hour must be between 0 and 23/],
    [{ year: 2024, minute: 60 }, /minute/],
    [{ year: 2024, second: 60 }, /second/],
    [{ year: 2024, millisecond: 1000 }, /millisecond/],
    [{ year: 2024.5 }, /year must be an integer/],
    [{ year: Number.NaN }, /year must be an integer/],
  ])("fromObject rejects %j", (c, message) => {
    expect(() => DateTime.fromObject(c, { zone: "utc" })).toThrow(message);
    expect(DateTime.tryFromObject(c, { zone: "utc" }).ok).toBe(false);
  });

  it("rejects unknown component names", () => {
    expect(() => DateTime.fromObject({ year: 2024, mnth: 1 } as never, { zone: "utc" })).toThrow(
      /Unknown component "mnth"/,
    );
  });

  it("throws ChronexaError with a code", () => {
    try {
      DateTime.fromObject({ year: 2024, month: 2, day: 31 }, { zone: "utc" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ChronexaError);
      expect((e as ChronexaError).code).toBe("INVALID_DATE");
    }
  });

  it("rejects bad epoch values and invalid Date objects", () => {
    expect(() => DateTime.fromMillis(Number.NaN)).toThrow(/finite/);
    expect(() => DateTime.fromMillis(1.5)).toThrow(/integer/);
    expect(() => DateTime.fromMillis(8.64e15 + 1)).toThrow(/outside the supported range/);
    expect(() => DateTime.fromJSDate(new Date("nope"))).toThrow(/invalid Date/);
    expect(() => DateTime.fromJSDate("2024" as never)).toThrow(/Date instance/);
  });

  it("rejects invalid locales and zones", () => {
    expect(() => DateTime.fromMillis(0, { locale: "not a locale" })).toThrow(/BCP 47/);
    expect(() => DateTime.fromMillis(0, { zone: "Mars/Olympus" })).toThrow(
      /not a recognised time zone/,
    );
  });

  it("try* returns a structured result", () => {
    const good = DateTime.tryFromISO("2024-01-01T00:00:00Z", { zone: "utc" });
    expect(good.ok && good.value.year).toBe(2024);
    const bad = DateTime.tryFromISO("garbage");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("PARSE_ERROR");
  });
});

describe("leap years and month-end arithmetic", () => {
  const u = (s: string) => DateTime.fromISO(s, { zone: "utc" });

  it("handles leap-year rules", () => {
    for (const [y, leap] of [
      [1900, false],
      [2000, true],
      [2023, false],
      [2024, true],
      [2100, false],
    ] as const) {
      expect(DateTime.fromObject({ year: y }, { zone: "utc" }).isLeapYear).toBe(leap);
    }
    expect(u("2024-02-29T00:00:00").add({ years: 1 }).toISODate()).toBe("2025-02-28");
    expect(u("2024-02-29T00:00:00").add({ years: 4 }).toISODate()).toBe("2028-02-29");
    expect(u("2024-02-28T00:00:00").add({ days: 1 }).toISODate()).toBe("2024-02-29");
    expect(u("2023-02-28T00:00:00").add({ days: 1 }).toISODate()).toBe("2023-03-01");
  });

  it("clamps months to month end", () => {
    expect(u("2024-01-31T00:00:00").add({ months: 1 }).toISODate()).toBe("2024-02-29");
    expect(u("2023-01-31T00:00:00").add({ months: 1 }).toISODate()).toBe("2023-02-28");
    expect(u("2024-03-31T00:00:00").subtract({ months: 1 }).toISODate()).toBe("2024-02-29");
    expect(u("2024-05-31T00:00:00").add({ months: 1 }).toISODate()).toBe("2024-06-30");
    // not cumulative: one step of 2 months differs from two steps of 1
    expect(u("2024-01-31T00:00:00").add({ months: 2 }).toISODate()).toBe("2024-03-31");
    expect(u("2024-01-31T00:00:00").add({ months: 1 }).add({ months: 1 }).toISODate()).toBe(
      "2024-03-29",
    );
  });

  it("crosses year boundaries in both directions", () => {
    expect(u("2024-12-31T23:59:59.999").add({ milliseconds: 1 }).toISO()).toBe(
      "2025-01-01T00:00:00.000Z",
    );
    expect(u("2025-01-01T00:00:00").subtract({ milliseconds: 1 }).toISO()).toBe(
      "2024-12-31T23:59:59.999Z",
    );
    expect(u("2024-11-15T00:00:00").add({ months: 14 }).toISODate()).toBe("2026-01-15");
    expect(u("2024-01-15T00:00:00").subtract({ months: 14 }).toISODate()).toBe("2022-11-15");
    expect(u("2024-01-01T00:00:00").subtract({ days: 1 }).toISODate()).toBe("2023-12-31");
  });

  it("applies mixed durations (calendar first, then elapsed)", () => {
    expect(u("2024-01-31T10:00:00").add({ months: 1, days: 1, hours: 25 }).toISO()).toBe(
      "2024-03-02T11:00:00.000Z",
    );
    expect(u("2024-01-01T00:00:00").add(Duration.fromISO("P1M2DT3H")).toISO()).toBe(
      "2024-02-03T03:00:00.000Z",
    );
    expect(
      u("2024-01-01T00:00:00")
        .add("P1W" as never)
        .toISODate(),
    ).toBe("2024-01-08");
  });

  it("supports fractional elapsed units without float noise", () => {
    expect(u("2024-01-01T00:00:00").add({ seconds: 1.1 }).millisecond).toBe(100);
    expect(u("2024-01-01T00:00:00").add({ hours: 0.5 }).minute).toBe(30);
    expect(() => u("2024-01-01T00:00:00").add({ milliseconds: 0.5 })).toThrow(
      /millisecond resolution/,
    );
  });

  it("rejects fractional calendar units", () => {
    expect(() => u("2024-01-01T00:00:00").add({ months: 1.5 })).toThrow(/integer/);
  });
});

describe("startOf / endOf", () => {
  const d = DateTime.fromISO("2024-05-15T13:45:30.123", { zone: "utc" }); // a Wednesday

  it.each([
    ["year", "2024-01-01T00:00:00.000Z", "2024-12-31T23:59:59.999Z"],
    ["quarter", "2024-04-01T00:00:00.000Z", "2024-06-30T23:59:59.999Z"],
    ["month", "2024-05-01T00:00:00.000Z", "2024-05-31T23:59:59.999Z"],
    ["week", "2024-05-13T00:00:00.000Z", "2024-05-19T23:59:59.999Z"],
    ["day", "2024-05-15T00:00:00.000Z", "2024-05-15T23:59:59.999Z"],
    ["hour", "2024-05-15T13:00:00.000Z", "2024-05-15T13:59:59.999Z"],
    ["minute", "2024-05-15T13:45:00.000Z", "2024-05-15T13:45:59.999Z"],
    ["second", "2024-05-15T13:45:30.000Z", "2024-05-15T13:45:30.999Z"],
  ] as const)("%s", (unit, start, end) => {
    expect(iso(d.startOf(unit))).toBe(start);
    expect(iso(d.endOf(unit))).toBe(end);
  });

  it("supports a configurable week start", () => {
    expect(d.startOf("week", { weekStart: 7 }).toISODate()).toBe("2024-05-12");
    expect(d.endOf("week", { weekStart: 7 }).toISODate()).toBe("2024-05-18");
    expect(() => d.startOf("week", { weekStart: 8 })).toThrow(/weekStart/);
  });

  it("endOf month handles February in leap and common years", () => {
    expect(
      DateTime.fromISO("2024-02-10T00:00:00", { zone: "utc" }).endOf("month").toISODate(),
    ).toBe("2024-02-29");
    expect(
      DateTime.fromISO("2023-02-10T00:00:00", { zone: "utc" }).endOf("month").toISODate(),
    ).toBe("2023-02-28");
  });

  it("is zone-aware", () => {
    const ny = DateTime.fromISO("2024-01-01T02:00:00Z", { zone: NY }); // still Dec 31 in New York
    expect(ny.startOf("day").toISO()).toBe("2023-12-31T00:00:00.000-05:00");
    expect(ny.startOf("year").toISO()).toBe("2023-01-01T00:00:00.000-05:00");
  });

  it("rejects unknown units", () => {
    expect(() => d.startOf("decade" as never)).toThrow(/Unknown unit/);
  });
});

describe("set", () => {
  it("replaces components strictly", () => {
    const d = DateTime.fromISO("2024-01-31T10:00:00", { zone: "utc" });
    expect(d.set({ hour: 5, minute: 6 }).toISO()).toBe("2024-01-31T05:06:00.000Z");
    expect(d.set({ day: 1, month: 2 }).toISODate()).toBe("2024-02-01");
    expect(() => d.set({ month: 2 })).toThrow(/does not exist in 2024-02/);
  });
});

describe("comparison", () => {
  const a = DateTime.fromISO("2024-01-01T00:00:00Z");
  const b = DateTime.fromISO("2024-01-01T00:00:01Z");

  it("compares instants regardless of zone", () => {
    expect(a.isBefore(b)).toBe(true);
    expect(b.isAfter(a)).toBe(true);
    expect(a.compare(b)).toBe(-1);
    expect(b.compare(a)).toBe(1);
    expect(a.compare(a.toZone(NY))).toBe(0);
    expect(a.equals(a.toZone("Asia/Tokyo"))).toBe(true);
    expect(a < b).toBe(true);
    expect([b, a].sort((x, y) => x.compare(y))[0]).toBe(a);
  });

  it("isSame judges the calendar unit in the receiver's zone", () => {
    const x = DateTime.fromISO("2024-06-01T03:00:00Z", { zone: NY }); // May 31 23:00 in NY
    const y = DateTime.fromISO("2024-05-31T12:00:00Z", { zone: NY });
    expect(x.isSame(y, "day")).toBe(true);
    expect(x.isSame(y, "month")).toBe(true);
    expect(x.toUTC().isSame(y, "month")).toBe(false);
  });

  it("rejects non-DateTime arguments", () => {
    expect(() => a.isBefore(new Date() as never)).toThrow(/must be a DateTime/);
  });
});

describe("differences", () => {
  const u = (s: string) => DateTime.fromISO(s, { zone: "utc" });

  it("elapsed measures real time with fractions", () => {
    const a = u("2024-01-01T00:00:00");
    const b = u("2024-01-01T01:30:00");
    expect(b.elapsed(a, "hour")).toBe(1.5);
    expect(b.elapsed(a, "minute")).toBe(90);
    expect(a.elapsed(b, "second")).toBe(-5400);
    expect(b.elapsed(a, "millisecond")).toBe(5_400_000);
    expect(() => b.elapsed(a, "day" as never)).toThrow(/diff\(\)/);
  });

  it("diff gives whole calendar units across months", () => {
    expect(u("2024-03-15T00:00:00").diff(u("2024-01-15T00:00:00"), "month").months).toBe(2);
    expect(u("2024-03-14T23:59:59").diff(u("2024-01-15T00:00:00"), "month").months).toBe(1);
    expect(u("2025-01-15T00:00:00").diff(u("2024-01-15T00:00:00"), "year").years).toBe(1);
    expect(u("2024-12-31T00:00:00").diff(u("2024-01-01T00:00:00"), "day").days).toBe(365);
    expect(u("2024-01-20T00:00:00").diff(u("2024-01-01T00:00:00"), "week").weeks).toBe(2);
  });

  it("diff spreads over several units and is antisymmetric", () => {
    const a = u("2024-01-01T00:00:00");
    const b = u("2025-03-04T05:06:07.008");
    const d = b.diff(a, ["year", "month", "day", "hour", "minute", "second", "millisecond"]);
    expect(d.toObject()).toEqual({
      years: 1,
      months: 2,
      days: 3,
      hours: 5,
      minutes: 6,
      seconds: 7,
      milliseconds: 8,
    });
    expect(
      a.diff(b, ["year", "month", "day", "hour", "minute", "second", "millisecond"]).toObject(),
    ).toEqual({
      years: -1,
      months: -2,
      days: -3,
      hours: -5,
      minutes: -6,
      seconds: -7,
      milliseconds: -8,
    });
  });

  it("diff clamps month ends like add", () => {
    expect(
      u("2024-03-01T00:00:00").diff(u("2024-01-31T00:00:00"), ["month", "day"]).toObject(),
    ).toEqual({ months: 1, days: 1 });
    // round-trip: other + diff = this
    const a = u("2024-01-31T10:00:00");
    const b = u("2024-07-04T03:00:00");
    expect(a.add(b.diff(a, ["month", "day", "hour"])).toISO()).toBe(b.toISO());
  });

  it("diff days follow the wall clock across DST (23-hour day)", () => {
    const a = DateTime.fromISO("2025-03-09T00:00:00", { zone: NY });
    const b = DateTime.fromISO("2025-03-10T00:00:00", { zone: NY });
    expect(b.elapsed(a, "hour")).toBe(23);
    expect(b.diff(a, "day").days).toBe(1);
    expect(b.diff(a, "hour").hours).toBe(23);
  });

  it("fractional option keeps the remainder in the smallest elapsed unit", () => {
    const a = u("2024-01-01T00:00:00");
    expect(a.add({ minutes: 90 }).diff(a, "hour", { fractional: true }).hours).toBe(1.5);
    expect(a.add({ minutes: 90 }).diff(a, "hour").hours).toBe(1);
  });

  it("calendarDiff counts boundaries crossed, not elapsed time", () => {
    const a = u("2024-01-31T23:59:00");
    const b = u("2024-02-01T00:01:00");
    expect(b.calendarDiff(a, "day")).toBe(1);
    expect(b.calendarDiff(a, "month")).toBe(1);
    expect(b.calendarDiff(a, "year")).toBe(0);
    expect(a.calendarDiff(b, "day")).toBe(-1);
    expect(u("2024-12-31T12:00:00").calendarDiff(u("2024-01-01T00:00:00"), "year")).toBe(0);
    expect(u("2025-01-01T00:00:00").calendarDiff(u("2024-12-31T23:59:59"), "year")).toBe(1);
    expect(u("2024-04-01T00:00:00").calendarDiff(u("2024-03-31T00:00:00"), "quarter")).toBe(1);
    // Sunday → Monday is a week boundary with Monday-start weeks
    expect(u("2024-05-13T00:00:00").calendarDiff(u("2024-05-12T00:00:00"), "week")).toBe(1);
    expect(
      u("2024-05-13T00:00:00").calendarDiff(u("2024-05-12T00:00:00"), "week", { weekStart: 7 }),
    ).toBe(0);
  });
});

describe("immutability", () => {
  it("never mutates the receiver", () => {
    const d = DateTime.fromISO("2024-05-15T13:45:30.123Z", { zone: NY });
    const before = d.toISO();
    d.add({ days: 3 });
    d.subtract({ months: 2 });
    d.set({ year: 1999 });
    d.startOf("month");
    d.endOf("year");
    d.toZone("Asia/Tokyo");
    d.withLocale("fr");
    expect(d.toISO()).toBe(before);
  });

  it("returns the same object for no-op additions", () => {
    const d = DateTime.fromISO("2024-05-15T13:45:30.123Z");
    expect(d.add({})).toBe(d);
    expect(d.add({ days: 0 })).toBe(d);
  });
});

describe("serialization", () => {
  const d = DateTime.fromISO("2024-05-15T03:04:05.006+05:30", { setZone: true });

  it("toISO variants", () => {
    expect(d.toISO()).toBe("2024-05-15T03:04:05.006+05:30");
    expect(d.toISO({ format: "basic" })).toBe("20240515T030405.006+0530");
    expect(d.toISO({ includeOffset: false })).toBe("2024-05-15T03:04:05.006");
    expect(d.set({ millisecond: 0 }).toISO({ suppressMilliseconds: true })).toBe(
      "2024-05-15T03:04:05+05:30",
    );
    expect(d.set({ second: 0, millisecond: 0 }).toISO({ suppressSeconds: true })).toBe(
      "2024-05-15T03:04+05:30",
    );
    expect(d.toISODate()).toBe("2024-05-15");
    expect(d.toISOTime()).toBe("03:04:05.006+05:30");
    expect(d.toUTC().toISO()).toBe("2024-05-14T21:34:05.006Z");
  });

  it("JSON and string forms are ISO", () => {
    expect(JSON.stringify({ at: d.toUTC() })).toBe('{"at":"2024-05-14T21:34:05.006Z"}');
    expect(`${d}`).toBe(d.toISO());
  });

  it("round-trips the instant through ISO", () => {
    for (const zone of ["utc", NY, "Asia/Kolkata", "+03:30", "Australia/Lord_Howe"]) {
      const x = DateTime.fromMillis(1_700_000_123_456, { zone });
      expect(DateTime.fromISO(x.toISO()).toMillis()).toBe(x.toMillis());
    }
  });

  it("expanded years round-trip", () => {
    const far = DateTime.fromObject({ year: 12345, month: 6, day: 7 }, { zone: "utc" });
    expect(far.toISO()).toBe("+012345-06-07T00:00:00.000Z");
    expect(DateTime.fromISO(far.toISO()).toMillis()).toBe(far.toMillis());
    const bce = DateTime.fromObject({ year: -44, month: 3, day: 15 }, { zone: "utc" });
    expect(bce.toISO()).toBe("-000044-03-15T00:00:00.000Z");
    expect(DateTime.fromISO(bce.toISO()).toMillis()).toBe(bce.toMillis());
  });
});
