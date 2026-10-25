import { describe, expect, it } from "vitest";
import {
  BusinessCalendar,
  ChronexaError,
  DateTime,
  holidayDates,
  holidayProvider,
  type HolidayRule,
} from "../src/index.js";

const d = (s: string, zone = "utc") => DateTime.fromISO(s, { zone });
const day = (dt: DateTime) => dt.toISODate();

describe("business days (Mon–Fri, no holidays)", () => {
  const cal = new BusinessCalendar();

  it("classifies days", () => {
    expect(cal.isBusinessDay(d("2024-01-05"))).toBe(true); // Friday
    expect(cal.isBusinessDay(d("2024-01-06"))).toBe(false); // Saturday
    expect(cal.isBusinessDay(d("2024-01-07"))).toBe(false); // Sunday
    expect(cal.isBusinessDay(d("2024-01-08"))).toBe(true);
    expect(cal.isWeekend(d("2024-01-06"))).toBe(true);
    expect(cal.isHoliday(d("2024-01-01"))).toBe(false);
  });

  it("adds business days across weekends", () => {
    expect(day(cal.addBusinessDays(d("2024-01-05"), 1))).toBe("2024-01-08");
    expect(day(cal.addBusinessDays(d("2024-01-05"), 5))).toBe("2024-01-12");
    expect(day(cal.addBusinessDays(d("2024-01-01"), 10))).toBe("2024-01-15");
    expect(day(cal.addBusinessDays(d("2024-01-03"), 2))).toBe("2024-01-05");
  });

  it("from a weekend, +1 is the next Monday and -1 the previous Friday", () => {
    expect(day(cal.addBusinessDays(d("2024-01-06"), 1))).toBe("2024-01-08");
    expect(day(cal.addBusinessDays(d("2024-01-07"), 1))).toBe("2024-01-08");
    expect(day(cal.addBusinessDays(d("2024-01-06"), -1))).toBe("2024-01-05");
    expect(day(cal.addBusinessDays(d("2024-01-07"), -1))).toBe("2024-01-05");
  });

  it("subtracts, and zero is the identity (even on a weekend)", () => {
    expect(day(cal.subtractBusinessDays(d("2024-01-08"), 1))).toBe("2024-01-05");
    expect(day(cal.subtractBusinessDays(d("2024-01-08"), 5))).toBe("2024-01-01");
    const sat = d("2024-01-06");
    expect(cal.addBusinessDays(sat, 0)).toBe(sat);
    expect(day(cal.nextBusinessDay(d("2024-01-05")))).toBe("2024-01-08");
    expect(day(cal.previousBusinessDay(d("2024-01-08")))).toBe("2024-01-05");
  });

  it("add and subtract are inverse starting from a business day", () => {
    for (const n of [1, 2, 4, 5, 6, 11, 100]) {
      const start = d("2024-03-06");
      expect(day(cal.subtractBusinessDays(cal.addBusinessDays(start, n), n))).toBe("2024-03-06");
    }
  });

  it("keeps the time of day and follows DST in wall-clock terms", () => {
    const fri = d("2025-03-07T09:00:00", "America/New_York");
    expect(cal.addBusinessDays(fri, 1).toISO()).toBe("2025-03-10T09:00:00.000-04:00");
  });

  it("validates arguments", () => {
    expect(() => cal.addBusinessDays(d("2024-01-01"), 1.5)).toThrow(/integer/);
    expect(() => cal.addBusinessDays(new Date() as never, 1)).toThrow(/DateTime/);
  });
});

describe("counting business days", () => {
  const cal = new BusinessCalendar();

  it("counts [start, end) by default", () => {
    expect(cal.countBusinessDays(d("2024-01-01"), d("2024-01-08"))).toBe(5); // Mon..Fri
    expect(cal.countBusinessDays(d("2024-01-01"), d("2024-01-02"))).toBe(1);
    expect(cal.countBusinessDays(d("2024-01-06"), d("2024-01-08"))).toBe(0); // Sat, Sun
    expect(cal.countBusinessDays(d("2024-01-01"), d("2024-01-01"))).toBe(0);
    expect(cal.countBusinessDays(d("2024-01-01"), d("2024-02-01"))).toBe(23);
  });

  it("endInclusive counts the end date too", () => {
    expect(cal.countBusinessDays(d("2024-01-01"), d("2024-01-08"), { endInclusive: true })).toBe(6);
    expect(cal.countBusinessDays(d("2024-01-01"), d("2024-01-01"), { endInclusive: true })).toBe(1);
    expect(cal.countBusinessDays(d("2024-01-06"), d("2024-01-06"), { endInclusive: true })).toBe(0);
    expect(cal.countBusinessDays(d("2024-01-01"), d("2024-01-06"), { endInclusive: true })).toBe(5);
  });

  it("ignores time of day and is consistent with addBusinessDays", () => {
    expect(cal.countBusinessDays(d("2024-01-01T23:59:59"), d("2024-01-02T00:00:01"))).toBe(1);
    for (const n of [0, 1, 3, 5, 9, 30]) {
      const start = d("2024-05-01");
      expect(cal.countBusinessDays(start, cal.addBusinessDays(start, n))).toBe(n);
    }
  });

  it("is antisymmetric", () => {
    expect(cal.countBusinessDays(d("2024-01-08"), d("2024-01-01"))).toBe(-5);
    expect(cal.countBusinessDays(d("2024-01-08"), d("2024-01-01"), { endInclusive: true })).toBe(
      -6,
    );
  });

  it("views the end date in the start's zone", () => {
    const start = d("2024-01-05T22:00:00", "America/New_York"); // Fri 22:00 NY
    const end = d("2024-01-08T03:00:00Z"); // Sun 22:00 NY → still Sunday
    expect(cal.countBusinessDays(start, end)).toBe(1); // only Friday itself
  });

  it("lists the days", () => {
    expect(cal.listBusinessDays(d("2024-01-04"), d("2024-01-09"))).toEqual([
      "2024-01-04",
      "2024-01-05",
      "2024-01-08",
    ]);
    expect(cal.listBusinessDays(d("2024-01-04"), d("2024-01-09"), { endInclusive: true })).toEqual([
      "2024-01-04",
      "2024-01-05",
      "2024-01-08",
      "2024-01-09",
    ]);
  });
});

describe("custom weekends and holidays", () => {
  it("supports a Friday–Saturday weekend", () => {
    const cal = new BusinessCalendar({ weekend: [5, 6] });
    expect(cal.isBusinessDay(d("2024-01-07"))).toBe(true); // Sunday
    expect(cal.isBusinessDay(d("2024-01-05"))).toBe(false); // Friday
    expect(day(cal.addBusinessDays(d("2024-01-04"), 1))).toBe("2024-01-07");
    expect(cal.weekend).toEqual([5, 6]);
  });

  it("supports a single-day weekend and a 7-day working week", () => {
    expect(new BusinessCalendar({ weekend: [7] }).isBusinessDay(d("2024-01-06"))).toBe(true);
    const all = new BusinessCalendar({ weekend: [] });
    expect(day(all.addBusinessDays(d("2024-01-05"), 3))).toBe("2024-01-08");
  });

  it("rejects impossible calendars", () => {
    expect(() => new BusinessCalendar({ weekend: [1, 2, 3, 4, 5, 6, 7] })).toThrow(
      /no business day/,
    );
    expect(() => new BusinessCalendar({ weekend: [0] })).toThrow(/weekend day/);
    expect(() => new BusinessCalendar({ holidays: ["2024-02-30"] })).toThrow(/does not exist/);
    expect(() => new BusinessCalendar({ holidays: ["01/02/2024"] })).toThrow(/YYYY-MM-DD/);
    expect(() => new BusinessCalendar({ holidays: [42 as never] })).toThrow(/DateTime/);
  });

  it("excludes explicit holidays", () => {
    const cal = new BusinessCalendar({ holidays: ["2024-12-25", d("2024-12-26")] });
    expect(cal.isHoliday(d("2024-12-25T15:00:00"))).toBe(true);
    expect(cal.isBusinessDay(d("2024-12-25"))).toBe(false);
    expect(day(cal.addBusinessDays(d("2024-12-24"), 1))).toBe("2024-12-27");
    expect(cal.countBusinessDays(d("2024-12-23"), d("2024-12-28"))).toBe(3); // Mon, Tue, Fri
    expect(day(cal.subtractBusinessDays(d("2024-12-27"), 1))).toBe("2024-12-24");
  });

  it("a holiday on a weekend changes nothing", () => {
    const cal = new BusinessCalendar({ holidays: ["2024-01-06"] });
    expect(cal.countBusinessDays(d("2024-01-01"), d("2024-01-08"))).toBe(5);
  });

  it("uses a holiday DateTime's own local date", () => {
    const cal = new BusinessCalendar({ holidays: [d("2024-07-04T23:00:00", "America/New_York")] });
    expect(cal.isBusinessDay(d("2024-07-04T12:00:00", "America/New_York"))).toBe(false);
    expect(cal.isBusinessDay(d("2024-07-05T12:00:00", "America/New_York"))).toBe(true);
  });

  it("accepts a provider function that sees the calendar day in the date's zone", () => {
    const seen: string[] = [];
    const cal = new BusinessCalendar({
      holidays: (dt) => {
        seen.push(`${dt.toISODate()}@${dt.zone.name}`);
        return dt.month === 12 && dt.day === 25;
      },
    });
    expect(cal.isBusinessDay(d("2024-12-25T13:00:00", "Asia/Tokyo"))).toBe(false);
    expect(seen).toContain("2024-12-25@Asia/Tokyo");
    expect(day(cal.addBusinessDays(d("2024-12-24"), 1))).toBe("2024-12-26");
    expect(cal.countBusinessDays(d("2024-12-23"), d("2024-12-27"))).toBe(3); // Mon, Tue, Thu
  });

  it("combines a provider with explicit dates", () => {
    const cal = new BusinessCalendar({
      holidays: (dt) => dt.day === 1,
      holidayDates: ["2024-01-03"],
    });
    expect(cal.isBusinessDay(d("2024-01-01"))).toBe(false);
    expect(cal.isBusinessDay(d("2024-01-03"))).toBe(false);
    expect(cal.isBusinessDay(d("2024-01-02"))).toBe(true);
  });

  it("fails loudly instead of looping forever when every day is a holiday", () => {
    const cal = new BusinessCalendar({ holidays: () => true });
    expect(() => cal.addBusinessDays(d("2024-01-01"), 1)).toThrow(ChronexaError);
  });
});

describe("holiday rules", () => {
  // These are sample rules a caller might define; Chronexa ships no country data.
  const rules: HolidayRule[] = [
    { type: "fixed", month: 1, day: 1, observed: "nearest-weekday" },
    { type: "nth-weekday", month: 11, weekday: 4, nth: 4 },
    { type: "nth-weekday", month: 5, weekday: 1, nth: -1 },
    { type: "fixed", month: 7, day: 4, observed: "nearest-weekday" },
    { type: "date", date: "2024-03-15" },
  ];

  it("computes nth and last weekdays", () => {
    expect(holidayDates([{ type: "nth-weekday", month: 11, weekday: 4, nth: 4 }], 2024)).toEqual([
      "2024-11-28",
    ]);
    expect(holidayDates([{ type: "nth-weekday", month: 11, weekday: 4, nth: 4 }], 2025)).toEqual([
      "2025-11-27",
    ]);
    expect(holidayDates([{ type: "nth-weekday", month: 5, weekday: 1, nth: -1 }], 2024)).toEqual([
      "2024-05-27",
    ]);
    expect(holidayDates([{ type: "nth-weekday", month: 2, weekday: 1, nth: 1 }], 2024)).toEqual([
      "2024-02-05",
    ]);
    expect(holidayDates([{ type: "nth-weekday", month: 2, weekday: 4, nth: 5 }], 2024)).toEqual([
      "2024-02-29",
    ]); // five Thursdays
    expect(holidayDates([{ type: "nth-weekday", month: 2, weekday: 4, nth: 5 }], 2023)).toEqual([]); // only four
  });

  it("observes weekend holidays on the nearest weekday, even across years", () => {
    const ny: HolidayRule[] = [{ type: "fixed", month: 1, day: 1, observed: "nearest-weekday" }];
    expect(holidayDates(ny, 2022)).toEqual([]); // Jan 1 2022 is Saturday → observed 2021-12-31
    expect(holidayDates(ny, 2021)).toEqual(["2021-01-01", "2021-12-31"]); // Fri Jan 1 + the observed 2022 holiday
    expect(holidayDates(ny, 2023)).toEqual(["2023-01-02"]); // Sunday → Monday
    expect(holidayDates(ny, 2024)).toEqual(["2024-01-01"]);
    expect(
      holidayDates([{ type: "fixed", month: 7, day: 4, observed: "nearest-weekday" }], 2026),
    ).toEqual(["2026-07-03"]);
    expect(holidayDates([{ type: "fixed", month: 7, day: 4 }], 2026)).toEqual(["2026-07-04"]);
  });

  it("Feb 29 occurs only in leap years", () => {
    const r: HolidayRule[] = [{ type: "fixed", month: 2, day: 29 }];
    expect(holidayDates(r, 2024)).toEqual(["2024-02-29"]);
    expect(holidayDates(r, 2025)).toEqual([]);
  });

  it("builds a provider usable by a calendar", () => {
    const cal = new BusinessCalendar({ holidays: holidayProvider(rules) });
    expect(cal.isBusinessDay(d("2024-11-28"))).toBe(false);
    expect(cal.isBusinessDay(d("2024-11-29"))).toBe(true);
    expect(cal.isBusinessDay(d("2024-05-27"))).toBe(false);
    expect(cal.isBusinessDay(d("2024-03-15"))).toBe(false);
    expect(cal.isBusinessDay(d("2021-12-31"))).toBe(false); // observed New Year's Day 2022
    expect(day(cal.addBusinessDays(d("2024-11-27"), 1))).toBe("2024-11-29");
    expect(holidayDates(rules, 2024)).toEqual([
      "2024-01-01",
      "2024-03-15",
      "2024-05-27",
      "2024-07-04",
      "2024-11-28",
    ]);
  });

  it("validates rules", () => {
    expect(() => holidayDates([{ type: "fixed", month: 13, day: 1 }], 2024)).toThrow(/month/);
    expect(() => holidayDates([{ type: "fixed", month: 2, day: 30 }], 2024)).toThrow(/day/);
    expect(() =>
      holidayDates([{ type: "nth-weekday", month: 1, weekday: 8, nth: 1 }], 2024),
    ).toThrow(/weekday/);
    expect(() =>
      holidayDates([{ type: "nth-weekday", month: 1, weekday: 1, nth: 6 }], 2024),
    ).toThrow(/nth/);
    expect(() => holidayProvider([{ type: "date", date: "nope" }])).toThrow(/YYYY-MM-DD/);
    expect(() => holidayProvider([{ type: "easter" } as never])).toThrow(
      /Unknown holiday rule type/,
    );
  });
});
