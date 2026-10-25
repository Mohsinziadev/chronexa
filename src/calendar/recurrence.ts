import { DateTime } from "../core/datetime.js";
import { ChronexaError, invalidArg } from "../core/result.js";
import type { Disambiguation } from "../timezone/zone.js";
import {
  civilFromDays,
  daysFromCivil,
  daysInMonth,
  isoWeekday,
  isoWeekdayFromDays,
  MAX_EPOCH_MS,
  MS_PER_DAY,
  mod,
  timeOfDayMs,
} from "../utils/calendar.js";
import { assertIntInRange } from "../utils/validate.js";
import { parseDateKey } from "./holidays.js";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

/** "The n-th `weekday` of the month": `nth` is 1–5 from the start or -1 … -5 from the end. */
export interface NthWeekday {
  /** ISO weekday, 1 = Monday … 7 = Sunday. */
  weekday: number;
  nth: number;
}

export interface RecurrenceOptions {
  freq: RecurrenceFrequency;
  /**
   * First candidate. Its wall-clock time of day and zone define every occurrence. `start`
   * itself is an occurrence only if it matches the rule.
   */
  start: DateTime;
  /** Repeat every n-th period (default 1). */
  interval?: number | undefined;
  /** Last allowed instant, inclusive. */
  until?: DateTime | undefined;
  /** Maximum number of occurrences, counted before `exclude` is applied (as in RFC 5545). */
  count?: number | undefined;
  /** ISO weekdays. Valid for `daily` (as a filter) and `weekly`. Weekly default: weekday of `start`. */
  byWeekday?: readonly number[] | undefined;
  /** Days of the month: 1–31, or -1 for the last day, -2 for the second last … `monthly`/`yearly`. Default: day of `start`. */
  byMonthDay?: readonly number[] | undefined;
  /** Nth weekday(s) of the month, e.g. `{ weekday: 1, nth: 2 }` = second Monday. `monthly`/`yearly`. Exclusive with `byMonthDay`. */
  byNthWeekday?: readonly NthWeekday[] | undefined;
  /** Months 1–12, `yearly` only. Default: month of `start`. */
  byMonth?: readonly number[] | undefined;
  /** First day of the week for `weekly` with `interval > 1` (ISO weekday, default 1 = Monday). */
  weekStart?: number | undefined;
  /** Local calendar dates to skip (`"YYYY-MM-DD"` or `DateTime`; the date in `start`'s zone). */
  exclude?: Iterable<DateTime | string> | undefined;
  /**
   * What to do when a day-of-month does not exist in a month (day 31 in April, Feb 29 in a
   * common year): `"skip"` (default, as RFC 5545) drops the occurrence; `"clamp"` moves it to the
   * month's last day.
   */
  invalidDate?: "skip" | "clamp" | undefined;
  /** For occurrences landing in a DST gap/overlap. Default `"compatible"`. */
  disambiguation?: Disambiguation | undefined;
}

export interface RangeOptions {
  /** Include occurrences exactly at `to`. Default `false`: the range is `[from, to)`. */
  inclusiveEnd?: boolean | undefined;
}

const MAX_EMPTY_PERIODS = 2000;

function assertDT(x: unknown, name: string): asserts x is DateTime {
  if (!(x instanceof DateTime)) throw invalidArg(`${name} must be a DateTime.`);
}

function checkList(
  list: readonly number[] | undefined,
  name: string,
  min: number,
  max: number,
  allowNegative = false,
) {
  if (list === undefined) return;
  if (list.length === 0) throw invalidArg(`${name} must not be empty.`);
  for (const v of list) {
    if (allowNegative && Number.isInteger(v) && v < 0) assertIntInRange(v, name, -max, -1);
    else assertIntInRange(v, name, min, max);
  }
}

/**
 * A recurrence rule: a practical, documented **subset** of RFC 5545 RRULE semantics
 * (frequency, interval, until, count, by-weekday, by-month-day, nth-weekday, by-month,
 * exclusions). It is not a full RFC 5545 implementation — there is no BYSETPOS, BYYEARDAY,
 * BYWEEKNO, sub-daily frequencies or RDATE, and it has not been conformance-tested against
 * the RFC.
 *
 * Occurrences keep the **wall-clock** time of `start` in its zone (09:00 stays 09:00 across
 * DST). Rules are evaluated lazily; unbounded rules (no `count`/`until`) are fine with
 * {@link RecurrenceRule.occurrences}, {@link RecurrenceRule.between} and {@link RecurrenceRule.after}.
 */
export class RecurrenceRule {
  readonly freq: RecurrenceFrequency;
  readonly start: DateTime;
  readonly interval: number;
  readonly until: DateTime | undefined;
  readonly count: number | undefined;
  readonly #byWeekday: readonly number[];
  readonly #filterWeekday: boolean;
  readonly #byMonthDay: readonly number[] | undefined;
  readonly #byNth: readonly NthWeekday[] | undefined;
  readonly #byMonth: readonly number[];
  readonly #weekStart: number;
  readonly #exclude: ReadonlySet<string>;
  readonly #clamp: boolean;
  readonly #disambiguation: Disambiguation | undefined;

  constructor(o: RecurrenceOptions) {
    if (!["daily", "weekly", "monthly", "yearly"].includes(o.freq)) {
      throw invalidArg(
        `freq must be "daily", "weekly", "monthly" or "yearly", received ${JSON.stringify(o.freq)}.`,
      );
    }
    assertDT(o.start, "start");
    this.freq = o.freq;
    this.start = o.start;
    this.interval = o.interval ?? 1;
    assertIntInRange(this.interval, "interval", 1, 1_000_000);
    if (o.until !== undefined) assertDT(o.until, "until");
    this.until = o.until;
    if (o.count !== undefined) assertIntInRange(o.count, "count", 1, Number.MAX_SAFE_INTEGER);
    this.count = o.count;

    const only = (cond: boolean, prop: string, where: string) => {
      if (!cond) throw invalidArg(`${prop} is only valid for ${where} rules.`);
    };
    if (o.byWeekday !== undefined)
      only(o.freq === "daily" || o.freq === "weekly", "byWeekday", "daily or weekly");
    if (o.byMonthDay !== undefined)
      only(o.freq === "monthly" || o.freq === "yearly", "byMonthDay", "monthly or yearly");
    if (o.byNthWeekday !== undefined)
      only(o.freq === "monthly" || o.freq === "yearly", "byNthWeekday", "monthly or yearly");
    if (o.byMonth !== undefined) only(o.freq === "yearly", "byMonth", "yearly");
    if (o.byMonthDay !== undefined && o.byNthWeekday !== undefined) {
      throw invalidArg("Use either byMonthDay or byNthWeekday, not both.");
    }
    checkList(o.byWeekday, "byWeekday", 1, 7);
    checkList(o.byMonthDay, "byMonthDay", 1, 31, true);
    checkList(o.byMonth, "byMonth", 1, 12);
    for (const n of o.byNthWeekday ?? []) {
      assertIntInRange(n.weekday, "byNthWeekday.weekday", 1, 7);
      if (!Number.isInteger(n.nth) || n.nth === 0 || Math.abs(n.nth) > 5)
        throw invalidArg("byNthWeekday.nth must be 1–5 or -1…-5.");
    }
    this.#byWeekday = [...new Set(o.byWeekday ?? [o.start.weekday])];
    this.#filterWeekday = o.byWeekday !== undefined;
    this.#byMonthDay = o.byMonthDay ? [...new Set(o.byMonthDay)] : undefined;
    this.#byNth = o.byNthWeekday ? [...o.byNthWeekday] : undefined;
    this.#byMonth = [...new Set(o.byMonth ?? [o.start.month])].sort((a, b) => a - b);
    this.#weekStart = o.weekStart ?? 1;
    assertIntInRange(this.#weekStart, "weekStart", 1, 7);
    this.#clamp = o.invalidDate === "clamp";
    this.#disambiguation = o.disambiguation;
    const ex = new Set<string>();
    for (const e of o.exclude ?? []) {
      ex.add(
        typeof e === "string"
          ? (parseDateKey(e), e)
          : (assertDT(e, "exclude entry"), e.toZone(o.start.zone).toISODate()),
      );
    }
    this.#exclude = ex;
  }

  /** Candidate local day numbers inside one month, ascending. */
  #monthDays(year: number, month: number): number[] {
    const dim = daysInMonth(year, month);
    const days = new Set<number>();
    if (this.#byNth) {
      for (const { weekday, nth } of this.#byNth) {
        let day: number;
        if (nth > 0) day = 1 + mod(weekday - isoWeekday(year, month, 1), 7) + (nth - 1) * 7;
        else day = dim - mod(isoWeekday(year, month, dim) - weekday, 7) + (nth + 1) * 7;
        if (day >= 1 && day <= dim) days.add(day);
      }
    } else {
      for (const d of this.#byMonthDay ?? [this.start.day]) {
        let day = d > 0 ? d : dim + d + 1;
        if (day > dim || day < 1) {
          if (!this.#clamp) continue;
          day = day > dim ? dim : 1;
        }
        days.add(day);
      }
    }
    return [...days].sort((a, b) => a - b).map((day) => daysFromCivil(year, month, day));
  }

  /** Candidate local day numbers for period `k`, ascending (may be empty). */
  #period(k: number, startDay: number): number[] {
    const s = this.start;
    switch (this.freq) {
      case "daily": {
        const day = startDay + k * this.interval;
        return this.#filterWeekday && !this.#byWeekday.includes(isoWeekdayFromDays(day))
          ? []
          : [day];
      }
      case "weekly": {
        const base =
          startDay - mod(isoWeekdayFromDays(startDay) - this.#weekStart, 7) + k * this.interval * 7;
        return this.#byWeekday
          .map((wd) => base + mod(wd - this.#weekStart, 7))
          .sort((a, b) => a - b);
      }
      case "monthly": {
        const idx = s.year * 12 + (s.month - 1) + k * this.interval;
        return this.#monthDays(Math.floor(idx / 12), mod(idx, 12) + 1);
      }
      case "yearly": {
        const year = s.year + k * this.interval;
        return this.#byMonth.flatMap((m) => this.#monthDays(year, m));
      }
    }
  }

  /**
   * Lazily yields occurrences in chronological order, honouring `count`, `until` and `exclude`.
   * A rule that can never match (e.g. yearly on Feb 30) ends after scanning
   * 2000 consecutive empty periods.
   */
  *occurrences(): Generator<DateTime> {
    const s = this.start;
    const startDay = daysFromCivil(s.year, s.month, s.day);
    const tod = timeOfDayMs(s.toObject());
    const untilMs = this.until?.toMillis() ?? Infinity;
    let generated = 0;
    let empty = 0;
    for (let k = 0; ; k++) {
      const days = this.#period(k, startDay).filter((d) => d >= startDay);
      if (days.length === 0) {
        if (++empty > MAX_EMPTY_PERIODS) return;
        continue;
      }
      empty = 0;
      for (const day of days) {
        const localMs = day * MS_PER_DAY + tod;
        if (Math.abs(localMs) > MAX_EPOCH_MS - 2 * MS_PER_DAY) return;
        const ms = s.zone.resolveLocal(localMs, this.#disambiguation);
        if (ms > untilMs) return;
        if (this.count !== undefined && generated >= this.count) return;
        generated++;
        const dt = DateTime.fromMillis(ms, { zone: s.zone, locale: s.locale });
        if (this.#exclude.size && this.#exclude.has(civilKey(day))) continue;
        yield dt;
      }
      if (this.count !== undefined && generated >= this.count) return;
    }
  }

  /** All occurrences as an array. Throws `UNBOUNDED` for a rule without `count`/`until` unless `limit` is given. */
  all(options: { limit?: number | undefined } = {}): DateTime[] {
    if (options.limit === undefined && this.count === undefined && this.until === undefined) {
      throw new ChronexaError(
        "UNBOUNDED",
        "This rule has no count or until, so it never ends. Pass { limit }, or use between()/after()/occurrences().",
      );
    }
    const out: DateTime[] = [];
    if (options.limit !== undefined && options.limit <= 0) return out;
    for (const o of this.occurrences()) {
      out.push(o);
      if (options.limit !== undefined && out.length >= options.limit) break;
    }
    return out;
  }

  /** Occurrences in `[from, to)` (or `[from, to]` with `inclusiveEnd`). */
  between(from: DateTime, to: DateTime, options: RangeOptions = {}): DateTime[] {
    assertDT(from, "from");
    assertDT(to, "to");
    const out: DateTime[] = [];
    const lo = from.toMillis();
    const hi = to.toMillis();
    for (const o of this.occurrences()) {
      const t = o.toMillis();
      if (t > hi || (t === hi && !options.inclusiveEnd)) break;
      if (t >= lo) out.push(o);
    }
    return out;
  }

  /** The first occurrence after `date` (or at it with `inclusive`), or `null`. */
  after(date: DateTime, options: { inclusive?: boolean | undefined } = {}): DateTime | null {
    assertDT(date, "date");
    const t = date.toMillis();
    for (const o of this.occurrences()) {
      if (o.toMillis() > t || (options.inclusive && o.toMillis() === t)) return o;
    }
    return null;
  }

  /** The last occurrence before `date` (or at it with `inclusive`), or `null`. */
  before(date: DateTime, options: { inclusive?: boolean | undefined } = {}): DateTime | null {
    assertDT(date, "date");
    const t = date.toMillis();
    let last: DateTime | null = null;
    for (const o of this.occurrences()) {
      if (o.toMillis() > t || (o.toMillis() === t && !options.inclusive)) break;
      last = o;
    }
    return last;
  }
}

function civilKey(dayNumber: number): string {
  const { year, month, day } = civilFromDays(dayNumber);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
