import type { DateTime } from "../core/datetime.js";
import { ChronexaError, invalidArg } from "../core/result.js";
import {
  civilFromDays,
  daysFromCivil,
  daysInMonth,
  isoWeekday,
  isoWeekdayFromDays,
} from "../utils/calendar.js";
import { assertIntInRange } from "../utils/validate.js";

/** A function that says whether the calendar day of `date` is a holiday. */
export type HolidayProvider = (date: DateTime) => boolean;

/**
 * Declarative holiday rules. Chronexa ships **no** country-specific holiday data; describe
 * your own calendar with rules, explicit dates, or a custom {@link HolidayProvider}.
 */
export type HolidayRule =
  | {
      /** Same month/day every year (e.g. 25 December). Feb 29 occurs only in leap years. */
      type: "fixed";
      month: number;
      day: number;
      /**
       * `"nearest-weekday"`: a Saturday occurrence is observed on the Friday before and a
       * Sunday occurrence on the Monday after (this rule assumes a Saturday/Sunday weekend).
       * Default `"none"`.
       */
      observed?: "none" | "nearest-weekday";
      name?: string;
    }
  | {
      /** The n-th given weekday of a month, e.g. the 4th Thursday of November. */
      type: "nth-weekday";
      month: number;
      /** ISO weekday, 1 = Monday … 7 = Sunday. */
      weekday: number;
      /** `1`–`5`, or `-1` for the last such weekday. A 5th weekday that does not exist is skipped. */
      nth: number;
      name?: string;
    }
  | {
      /** A single explicit date, `YYYY-MM-DD`. */
      type: "date";
      date: string;
      name?: string;
    };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses and validates a `YYYY-MM-DD` string into a day number (days since epoch). @internal */
export function parseDateKey(text: string): number {
  const m = typeof text === "string" ? ISO_DATE.exec(text) : null;
  if (!m) throw invalidArg(`${JSON.stringify(text)} is not a YYYY-MM-DD date.`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, Math.min(Math.max(mo, 1), 12))) {
    throw new ChronexaError(
      "INVALID_DATE",
      `${text} does not exist as a calendar date; invalid dates are never rolled over.`,
    );
  }
  return daysFromCivil(y, mo, d);
}

/** `YYYY-MM-DD` for a day number. @internal */
export function dateKey(dayNumber: number): string {
  const { year, month, day } = civilFromDays(dayNumber);
  const y = year >= 0 && year <= 9999 ? String(year).padStart(4, "0") : String(year);
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function validate(rule: HolidayRule): void {
  switch (rule.type) {
    case "fixed":
      assertIntInRange(rule.month, "rule.month", 1, 12);
      assertIntInRange(rule.day, "rule.day", 1, daysInMonth(2024, rule.month)); // 2024 is a leap year
      break;
    case "nth-weekday":
      assertIntInRange(rule.month, "rule.month", 1, 12);
      assertIntInRange(rule.weekday, "rule.weekday", 1, 7);
      if (![1, 2, 3, 4, 5, -1].includes(rule.nth))
        throw invalidArg(`rule.nth must be 1–5 or -1 (last), received ${String(rule.nth)}.`);
      break;
    case "date":
      parseDateKey(rule.date);
      break;
    default:
      throw invalidArg(
        `Unknown holiday rule type ${JSON.stringify((rule as { type?: unknown }).type)}.`,
      );
  }
}

function nthWeekdayDay(year: number, month: number, weekday: number, nth: number): number | null {
  const dim = daysInMonth(year, month);
  if (nth > 0) {
    const first = isoWeekday(year, month, 1);
    const day = 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7;
    return day <= dim ? day : null;
  }
  const last = isoWeekday(year, month, dim);
  return dim - ((last - weekday + 7) % 7);
}

/** Holiday day numbers (days since epoch) that fall in `year`, ascending. @internal */
function dayNumbersInYear(rules: readonly HolidayRule[], year: number): number[] {
  const out = new Set<number>();
  const lo = daysFromCivil(year, 1, 1);
  const hi = daysFromCivil(year + 1, 1, 1);
  const add = (n: number) => {
    if (n >= lo && n < hi) out.add(n);
  };
  for (const rule of rules) {
    if (rule.type === "date") {
      add(parseDateKey(rule.date));
    } else if (rule.type === "fixed") {
      // The observed date can cross a year boundary, so look at neighbouring years too.
      for (const y of [year - 1, year, year + 1]) {
        if (rule.month === 2 && rule.day === 29 && daysInMonth(y, 2) < 29) continue;
        let n = daysFromCivil(y, rule.month, rule.day);
        if (rule.observed === "nearest-weekday") {
          const wd = isoWeekdayFromDays(n);
          if (wd === 6) n -= 1;
          else if (wd === 7) n += 1;
        }
        add(n);
      }
    } else {
      const day = nthWeekdayDay(year, rule.month, rule.weekday, rule.nth);
      if (day !== null) add(daysFromCivil(year, rule.month, day));
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The holidays that rules produce in `year`, as sorted `YYYY-MM-DD` strings. */
export function holidayDates(rules: readonly HolidayRule[], year: number): string[] {
  rules.forEach(validate);
  assertIntInRange(year, "year", -271820, 275759);
  return dayNumbersInYear(rules, year).map(dateKey);
}

/**
 * Builds a {@link HolidayProvider} from declarative rules. Years are computed lazily and cached.
 */
export function holidayProvider(rules: readonly HolidayRule[]): HolidayProvider {
  rules.forEach(validate);
  const frozen = [...rules];
  const cache = new Map<number, Set<string>>();
  return (date) => {
    const year = date.year;
    let set = cache.get(year);
    if (!set) {
      set = new Set(dayNumbersInYear(frozen, year).map(dateKey));
      cache.set(year, set);
    }
    return set.has(date.toISODate());
  };
}
