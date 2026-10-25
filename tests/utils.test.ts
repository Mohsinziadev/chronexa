import { describe, expect, it } from "vitest";
import {
  DateTime,
  clamp,
  compare,
  countDays,
  dayOfYear,
  daysInMonth,
  daysInYear,
  isLeapYear,
  isoWeek,
  isoWeekday,
  max,
  min,
  quarterOf,
  weeksInIsoYear,
} from "../src/index.js";

const d = (s: string, zone = "utc") => DateTime.fromISO(s, { zone });

describe("calendar helpers", () => {
  it("isLeapYear", () => {
    expect([1600, 1900, 2000, 2023, 2024, 2100, 2400].map(isLeapYear)).toEqual([
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(() => isLeapYear(2024.5)).toThrow(/integer/);
  });

  it("daysInMonth / daysInYear", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2023, m))).toEqual([
      31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
    ]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInYear(2024)).toBe(366);
    expect(daysInYear(2023)).toBe(365);
    expect(() => daysInMonth(2024, 13)).toThrow(/month/);
  });

  it("dayOfYear", () => {
    expect(dayOfYear(2024, 1, 1)).toBe(1);
    expect(dayOfYear(2024, 3, 1)).toBe(61);
    expect(dayOfYear(2023, 3, 1)).toBe(60);
    expect(dayOfYear(2024, 12, 31)).toBe(366);
    expect(() => dayOfYear(2023, 2, 29)).toThrow(/day must be between/);
  });

  it("isoWeekday", () => {
    expect(isoWeekday(2024, 3, 9)).toBe(6);
    expect(isoWeekday(2024, 3, 11)).toBe(1);
    expect(isoWeekday(2024, 3, 10)).toBe(7);
    expect(isoWeekday(1970, 1, 1)).toBe(4);
    expect(isoWeekday(1969, 12, 31)).toBe(3);
  });

  it("isoWeek follows ISO 8601 (Monday weeks, week 1 contains Jan 4)", () => {
    expect(isoWeek(2021, 1, 3)).toEqual({ weekYear: 2020, weekNumber: 53 });
    expect(isoWeek(2021, 1, 4)).toEqual({ weekYear: 2021, weekNumber: 1 });
    expect(isoWeek(2024, 12, 30)).toEqual({ weekYear: 2025, weekNumber: 1 });
    expect(isoWeek(2026, 1, 1)).toEqual({ weekYear: 2026, weekNumber: 1 });
    expect(isoWeek(2024, 12, 29)).toEqual({ weekYear: 2024, weekNumber: 52 });
    expect(isoWeek(2020, 12, 31)).toEqual({ weekYear: 2020, weekNumber: 53 });
    expect(isoWeek(2023, 1, 1)).toEqual({ weekYear: 2022, weekNumber: 52 });
    expect(weeksInIsoYear(2020)).toBe(53);
    expect(weeksInIsoYear(2021)).toBe(52);
    expect(weeksInIsoYear(2026)).toBe(53);
  });

  it("quarterOf", () => {
    expect([1, 3, 4, 6, 7, 9, 10, 12].map(quarterOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(() => quarterOf(0)).toThrow();
  });
});

describe("min / max / clamp / compare", () => {
  const a = d("2024-01-01");
  const b = d("2024-06-01");
  const c = d("2024-12-01");

  it("min and max pick by instant", () => {
    expect(min(b, a, c)).toBe(a);
    expect(max(b, a, c)).toBe(c);
    expect(min(a)).toBe(a);
    expect(min(a, a.toZone("Asia/Tokyo"))).toBe(a); // first of equals
    expect(() => min()).toThrow(/at least one/);
    expect(() => max(new Date() as never)).toThrow(/only DateTime/);
  });

  it("clamp restricts to inclusive bounds", () => {
    expect(clamp(a, b, c)).toBe(b);
    expect(clamp(c, a, b)).toBe(b);
    expect(clamp(b, a, c)).toBe(b);
    expect(clamp(b, b, b)).toBe(b);
    expect(() => clamp(a, c, b)).toThrow(/lower bound is after/);
  });

  it("compare orders arrays", () => {
    expect([c, a, b].sort(compare)).toEqual([a, b, c]);
    expect(compare(a, a.toZone("Europe/Paris"))).toBe(0);
  });
});

describe("countDays", () => {
  it("is exclusive by default and inclusive on request", () => {
    expect(countDays(d("2024-01-01"), d("2024-01-03"))).toBe(2);
    expect(countDays(d("2024-01-01"), d("2024-01-03"), { inclusive: true })).toBe(3);
    expect(countDays(d("2024-01-01"), d("2024-01-01"))).toBe(0);
    expect(countDays(d("2024-01-01"), d("2024-01-01"), { inclusive: true })).toBe(1);
    expect(countDays(d("2024-01-03"), d("2024-01-01"))).toBe(-2);
    expect(countDays(d("2024-01-03"), d("2024-01-01"), { inclusive: true })).toBe(-3);
  });

  it("ignores time of day and counts calendar days across DST", () => {
    expect(countDays(d("2024-01-01T23:59:00"), d("2024-01-02T00:01:00"))).toBe(1);
    expect(
      countDays(
        d("2025-03-09T00:00:00", "America/New_York"),
        d("2025-03-10T00:00:00", "America/New_York"),
      ),
    ).toBe(1);
    expect(countDays(d("2024-02-28"), d("2024-03-01"))).toBe(2); // leap year
    expect(countDays(d("2023-02-28"), d("2023-03-01"))).toBe(1);
  });
});
