import { describe, expect, it } from "vitest";
import { ChronexaError, DateTime, Duration } from "../src/index.js";

const ny = (s: string) => DateTime.fromISO(s, { zone: "America/New_York" });

describe("creation and validation", () => {
  it("builds from units, millis and ISO strings", () => {
    expect(Duration.from({ hours: 1, minutes: 30 }).toObject()).toEqual({ hours: 1, minutes: 30 });
    expect(Duration.fromMillis(1500).toObject()).toEqual({ milliseconds: 1500 });
    expect(Duration.from("P1DT12H").toObject()).toEqual({ days: 1, hours: 12 });
    expect(Duration.from(Duration.from({ days: 1 })).days).toBe(1);
    expect(Duration.from({}).isZero).toBe(true);
    expect(Object.isFrozen(Duration.from({ days: 1 }))).toBe(true);
  });

  it.each([
    [{ hours: Number.NaN }],
    [{ hours: Infinity }],
    [{ days: -Infinity }],
    [{ minutes: "5" }],
    [{ fortnights: 1 }],
    [{ day: 1 }],
    [{ months: 1.5 }],
    [{ years: 0.5 }],
    [{ days: 0.5 }],
    [null],
  ])("rejects %j", (input) => {
    expect(() => Duration.from(input as never)).toThrow(ChronexaError);
  });

  it("normalises negative zero", () => {
    expect(Object.is(Duration.from({ hours: -0 }).hours, 0)).toBe(true);
  });

  it("allows fractional elapsed units only", () => {
    expect(Duration.from({ hours: 1.5 }).as("minute")).toBe(90);
  });
});

describe("arithmetic", () => {
  it("adds, subtracts and negates field by field", () => {
    const a = Duration.from({ days: 1, hours: 2 });
    const b = Duration.from({ hours: 23, minutes: 5 });
    expect(a.add(b).toObject()).toEqual({ days: 1, hours: 25, minutes: 5 });
    expect(a.subtract({ hours: 2 }).toObject()).toEqual({ days: 1 });
    expect(a.negate().toObject()).toEqual({ days: -1, hours: -2 });
    expect(a.with({ days: 3 }).toObject()).toEqual({ days: 3, hours: 2 });
  });

  it("sign reflects mixed signs honestly", () => {
    expect(Duration.from({ hours: 1, days: 2 }).sign).toBe(1);
    expect(Duration.from({ hours: -1 }).sign).toBe(-1);
    expect(Duration.from({}).sign).toBe(0);
    expect(Duration.from({ hours: 1, days: -2 }).sign).toBeNull();
  });

  it("never mutates", () => {
    const a = Duration.from({ hours: 1 });
    a.add({ hours: 1 });
    a.normalize();
    expect(a.hours).toBe(1);
  });
});

describe("fixed vs calendar", () => {
  it("toMillis works for elapsed units only", () => {
    expect(Duration.from({ hours: 1, seconds: 1, milliseconds: 1 }).toMillis()).toBe(3_601_001);
    expect(() => Duration.from({ months: 1 }).toMillis()).toThrow(/relativeTo/);
    expect(() => Duration.from({ days: 1 }).toMillis()).toThrow(/calendar units/);
  });

  it("toMillis with relativeTo depends on the reference date", () => {
    const m = Duration.from({ months: 1 });
    expect(m.toMillis({ relativeTo: ny("2024-02-01T00:00:00") })).toBe(29 * 86_400_000);
    expect(m.toMillis({ relativeTo: ny("2023-02-01T00:00:00") })).toBe(28 * 86_400_000);
    expect(m.toMillis({ relativeTo: ny("2024-01-01T00:00:00") })).toBe(31 * 86_400_000);
  });

  it("a day is 23, 24 or 25 hours depending on DST", () => {
    const day = Duration.from({ days: 1 });
    expect(day.as("hour", { relativeTo: ny("2025-03-09T00:00:00") })).toBe(23);
    expect(day.as("hour", { relativeTo: ny("2025-06-01T00:00:00") })).toBe(24);
    expect(day.as("hour", { relativeTo: ny("2025-11-02T00:00:00") })).toBe(25);
  });

  it("as() converts exactly inside a group and demands relativeTo across groups", () => {
    expect(Duration.from({ years: 1, months: 6 }).as("month")).toBe(18);
    expect(Duration.from({ months: 18 }).as("year")).toBe(1.5);
    expect(Duration.from({ weeks: 1, days: 3 }).as("day")).toBe(10);
    expect(Duration.from({ days: 14 }).as("week")).toBe(2);
    expect(() => Duration.from({ months: 1 }).as("day")).toThrow(/relativeTo/);
    expect(() => Duration.from({ days: 1 }).as("hour")).toThrow(/relativeTo/);
    expect(Duration.from({ months: 1 }).as("day", { relativeTo: ny("2024-02-01T00:00:00") })).toBe(
      29,
    );
    expect(Duration.from({ hours: 36 }).as("day", { relativeTo: ny("2024-02-01T00:00:00") })).toBe(
      1.5,
    );
    expect(
      Duration.from({ days: 45 }).as("month", { relativeTo: ny("2024-01-01T00:00:00") }),
    ).toBeCloseTo(1 + 14 / 29, 6);
    expect(
      Duration.from({ days: -45 }).as("month", { relativeTo: ny("2024-01-01T00:00:00") }),
    ).toBeLessThan(-1);
  });
});

describe("normalize and shiftTo", () => {
  it("cascades within groups without crossing them", () => {
    expect(Duration.from({ minutes: 90 }).normalize().toObject()).toEqual({
      hours: 1,
      minutes: 30,
    });
    expect(Duration.from({ milliseconds: 3_661_001 }).normalize().toObject()).toEqual({
      hours: 1,
      minutes: 1,
      seconds: 1,
      milliseconds: 1,
    });
    expect(Duration.from({ months: 14 }).normalize().toObject()).toEqual({ years: 1, months: 2 });
    expect(Duration.from({ days: 10 }).normalize().toObject()).toEqual({ weeks: 1, days: 3 });
    // 24 hours stays hours: it is not a day
    expect(Duration.from({ hours: 24 }).normalize().toObject()).toEqual({ hours: 24 });
    expect(Duration.from({ hours: -90, minutes: 30 }).normalize().toObject()).toEqual({
      hours: -89,
      minutes: -30,
    });
  });

  it("shiftTo redistributes", () => {
    expect(Duration.from({ minutes: 150 }).shiftTo(["hour", "minute"]).toObject()).toEqual({
      hours: 2,
      minutes: 30,
    });
    expect(Duration.from({ hours: 1, minutes: 30 }).shiftTo(["minute"]).toObject()).toEqual({
      minutes: 90,
    });
    expect(Duration.from({ hours: 1, minutes: 30 }).shiftTo(["hour"]).toObject()).toEqual({
      hours: 1.5,
    });
    expect(Duration.from({ months: 14 }).shiftTo(["year", "month"]).toObject()).toEqual({
      years: 1,
      months: 2,
    });
    expect(Duration.from({ years: 1, months: 2 }).shiftTo(["month"]).toObject()).toEqual({
      months: 14,
    });
    expect(Duration.from({ weeks: 2, days: 1 }).shiftTo(["day"]).toObject()).toEqual({ days: 15 });
    expect(() => Duration.from({ months: 1 }).shiftTo(["day"])).toThrow(/relativeTo/);
    expect(() => Duration.from({ days: 1 }).shiftTo(["hour"])).toThrow(/relativeTo/);
    expect(() => Duration.from({}).shiftTo([])).toThrow(/at least one/);
  });

  it("shiftTo across groups uses the reference date", () => {
    const s = Duration.from({ months: 1, days: 1 }).shiftTo(["day"], {
      relativeTo: ny("2024-02-01T00:00:00"),
    });
    expect(s.days).toBe(30);
    const h = Duration.from({ days: 1 }).shiftTo(["hour"], {
      relativeTo: ny("2025-03-09T00:00:00"),
    });
    expect(h.hours).toBe(23);
  });
});

describe("comparison", () => {
  it("compares elapsed durations by length", () => {
    expect(Duration.from({ minutes: 90 }).compare({ hours: 1, minutes: 30 })).toBe(0);
    expect(Duration.from({ minutes: 59 }).compare({ hours: 1 })).toBe(-1);
    expect(Duration.from({ hours: 2 }).compare({ hours: 1 })).toBe(1);
  });

  it("refuses to compare calendar durations without a reference", () => {
    expect(() => Duration.from({ months: 1 }).compare({ days: 30 })).toThrow(/relativeTo/);
    expect(
      Duration.from({ months: 1 }).compare({ days: 30 }, { relativeTo: ny("2024-04-01T00:00:00") }),
    ).toBe(0);
    expect(
      Duration.from({ months: 1 }).compare({ days: 30 }, { relativeTo: ny("2024-03-01T00:00:00") }),
    ).toBe(1);
  });

  it("equals normalises but does not equate different calendar quantities", () => {
    expect(Duration.from({ minutes: 60 }).equals({ hours: 1 })).toBe(true);
    expect(Duration.from({ months: 12 }).equals({ years: 1 })).toBe(true);
    expect(Duration.from({ months: 1 }).equals({ days: 30 })).toBe(false);
    expect(Duration.from({ hours: 24 }).equals({ days: 1 })).toBe(false);
  });
});

describe("ISO 8601", () => {
  it.each([
    ["P1Y2M3DT4H5M6S", { years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6 }],
    ["P2W", { weeks: 2 }],
    ["PT0.5S", { seconds: 0.5 }],
    ["PT1,5S", { seconds: 1.5 }],
    ["PT36H", { hours: 36 }],
    ["P1M", { months: 1 }],
    ["PT1M", { minutes: 1 }],
    ["-P1DT2H", { days: -1, hours: -2 }],
    ["+P1D", { days: 1 }],
    ["P1W2D", { weeks: 1, days: 2 }],
  ])("parses %s", (text, expected) => {
    expect(Duration.fromISO(text).toObject()).toEqual(expected);
  });

  it.each([
    "",
    "P",
    "PT",
    "1D",
    "P1.5D",
    "P1H",
    "PT1D",
    "P1D1Y",
    "P-1D",
    "PT1S2M",
    "P1DT",
    "p1d",
    " P1D",
    "P1D ",
  ])("rejects %j", (text) => {
    expect(() => Duration.fromISO(text)).toThrow(/ISO 8601 duration/);
    expect(Duration.tryFromISO(text).ok).toBe(false);
  });

  it("serialises", () => {
    expect(Duration.from({}).toISO()).toBe("PT0S");
    expect(
      Duration.from({
        years: 1,
        months: 2,
        days: 3,
        hours: 4,
        minutes: 5,
        seconds: 6,
        milliseconds: 500,
      }).toISO(),
    ).toBe("P1Y2M3DT4H5M6.5S");
    expect(Duration.from({ weeks: 2 }).toISO()).toBe("P2W");
    expect(Duration.from({ weeks: 1, days: 2 }).toISO()).toBe("P9D");
    expect(Duration.from({ days: -1, hours: -2 }).toISO()).toBe("-P1DT2H");
    expect(Duration.from({ milliseconds: 1 }).toISO()).toBe("PT0.001S");
    expect(JSON.stringify({ d: Duration.from({ hours: 1 }) })).toBe('{"d":"PT1H"}');
    expect(() => Duration.from({ days: 1, hours: -1 }).toISO()).toThrow(/mixed-sign/);
  });

  it("round-trips", () => {
    for (const text of ["P1Y2M3DT4H5M6.5S", "P2W", "-P1DT2H", "PT0.25S", "P10D"]) {
      expect(Duration.fromISO(text).toISO()).toBe(text);
    }
  });
});

describe("human formatting", () => {
  it("lists units with Intl", () => {
    expect(Duration.from({ days: 1, hours: 12 }).toHuman({ locale: "en" })).toBe("1 day, 12 hours");
    expect(Duration.from({ hours: 2, minutes: 5 }).toHuman({ locale: "en", style: "short" })).toBe(
      "2 hr, 5 min",
    );
    expect(Duration.from({ hours: 2, minutes: 5 }).toHuman({ locale: "en", style: "narrow" })).toBe(
      "2h 5m",
    );
    expect(Duration.from({ hours: 2, minutes: 5 }).toHuman({ locale: "de" })).toBe(
      "2 Stunden, 5 Minuten",
    );
    expect(
      Duration.from({ years: 1, months: 2, days: 3 }).toHuman({ locale: "en", maxUnits: 2 }),
    ).toBe("1 year, 2 months");
    expect(Duration.from({}).toHuman({ locale: "en" })).toBe("0 seconds");
    expect(Duration.from({ seconds: 1 }).toHuman({ locale: "en" })).toBe("1 second");
  });
});
