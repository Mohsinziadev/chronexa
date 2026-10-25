import * as cal from "./calendar.js";
import { assertIntInRange } from "./validate.js";

/** True for Gregorian leap years (divisible by 4, except centuries not divisible by 400). */
export function isLeapYear(year: number): boolean {
  assertIntInRange(year, "year", -271820, 275759);
  return cal.isLeapYear(year);
}

/** Number of days in `month` (1–12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  assertIntInRange(year, "year", -271820, 275759);
  assertIntInRange(month, "month", 1, 12);
  return cal.daysInMonth(year, month);
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

function checkDate(year: number, month: number, day: number): void {
  assertIntInRange(year, "year", -271820, 275759);
  assertIntInRange(month, "month", 1, 12);
  assertIntInRange(day, "day", 1, cal.daysInMonth(year, month));
}

/** Day of the year, 1–366. */
export function dayOfYear(year: number, month: number, day: number): number {
  checkDate(year, month, day);
  return cal.dayOfYear(year, month, day);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(year: number, month: number, day: number): number {
  checkDate(year, month, day);
  return cal.isoWeekday(year, month, day);
}

/**
 * ISO 8601 week of a calendar date: weeks start Monday and week 1 is the week containing
 * January 4th. `weekYear` can differ from `year` near the new year.
 */
export function isoWeek(
  year: number,
  month: number,
  day: number,
): { weekYear: number; weekNumber: number } {
  checkDate(year, month, day);
  return cal.isoWeekOf(year, month, day);
}

/** Number of ISO weeks (52 or 53) in an ISO week-year. */
export function weeksInIsoYear(weekYear: number): number {
  assertIntInRange(weekYear, "weekYear", -271820, 275759);
  return cal.weeksInIsoYear(weekYear);
}

/** Calendar quarter (1–4) of a month (1–12). */
export function quarterOf(month: number): number {
  assertIntInRange(month, "month", 1, 12);
  return Math.ceil(month / 3);
}
