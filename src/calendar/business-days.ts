import { DateTime } from "../core/datetime.js";
import { ChronexaError, invalidArg } from "../core/result.js";
import { civilFromDays, daysFromCivil, isoWeekdayFromDays } from "../utils/calendar.js";
import { assertIntInRange } from "../utils/validate.js";
import { dateKey, parseDateKey, type HolidayProvider } from "./holidays.js";

export interface BusinessCalendarOptions {
  /** ISO weekdays (1 = Monday … 7 = Sunday) that are not working days. Default `[6, 7]`. */
  weekend?: readonly number[] | undefined;
  /**
   * Days off in addition to the weekend: explicit dates (`"YYYY-MM-DD"` strings or `DateTime`s,
   * whose own local date is used) and/or a provider function. No holidays are assumed by default.
   */
  holidays?: Iterable<DateTime | string> | HolidayProvider | undefined;
  /** Extra explicit holiday dates when `holidays` is a provider function. */
  holidayDates?: Iterable<DateTime | string> | undefined;
}

export interface CountOptions {
  /**
   * Count `end` itself as well. Default `false`: the range is `[start, end)`. `start` is
   * always counted when it is a business day.
   */
  endInclusive?: boolean | undefined;
}

const MAX_STEPS_FACTOR = 100;

function assertDT(x: unknown, name: string): asserts x is DateTime {
  if (!(x instanceof DateTime)) throw invalidArg(`${name} must be a DateTime.`);
}

/**
 * A working-day calendar: which weekdays are off and which dates are holidays.
 *
 * All calculations work on **local calendar dates in the zone of the date you pass**; the
 * time of day is ignored when deciding whether a day is a business day and is preserved
 * when moving between days.
 */
export class BusinessCalendar {
  readonly weekend: readonly number[];
  readonly #weekendSet: ReadonlySet<number>;
  readonly #holidayDays: ReadonlySet<number>;
  readonly #provider: HolidayProvider | undefined;

  constructor(options: BusinessCalendarOptions = {}) {
    const weekend = [...new Set(options.weekend ?? [6, 7])].sort((a, b) => a - b);
    weekend.forEach((d) => assertIntInRange(d, "weekend day", 1, 7));
    if (weekend.length === 7) {
      throw invalidArg("Every weekday is marked as weekend, so no business day exists.");
    }
    this.weekend = Object.freeze(weekend);
    this.#weekendSet = new Set(weekend);

    const days = new Set<number>();
    const addAll = (items: Iterable<DateTime | string>) => {
      for (const h of items) {
        days.add(
          typeof h === "string"
            ? parseDateKey(h)
            : DateTime.isDateTime(h)
              ? parseDateKey(h.toISODate())
              : (() => {
                  throw invalidArg("Holidays must be DateTime or 'YYYY-MM-DD' strings.");
                })(),
        );
      }
    };
    if (typeof options.holidays === "function") this.#provider = options.holidays;
    else if (options.holidays) addAll(options.holidays);
    if (options.holidayDates) addAll(options.holidayDates);
    this.#holidayDays = days;
  }

  #isOff(dayNumber: number, like: DateTime): boolean {
    if (this.#weekendSet.has(isoWeekdayFromDays(dayNumber))) return true;
    if (this.#holidayDays.has(dayNumber)) return true;
    if (this.#provider) {
      const { year, month, day } = civilFromDays(dayNumber);
      return this.#provider(
        DateTime.fromObject({ year, month, day }, { zone: like.zone, locale: like.locale }),
      );
    }
    return false;
  }

  /** True if the date is an explicit holiday or the provider says so (weekends are not considered). */
  isHoliday(date: DateTime): boolean {
    assertDT(date, "date");
    const n = daysFromCivil(date.year, date.month, date.day);
    return (
      this.#holidayDays.has(n) || (this.#provider ? this.#provider(date.startOf("day")) : false)
    );
  }

  isWeekend(date: DateTime): boolean {
    assertDT(date, "date");
    return this.#weekendSet.has(date.weekday);
  }

  /** Not a weekend day and not a holiday. */
  isBusinessDay(date: DateTime): boolean {
    assertDT(date, "date");
    return !this.#isOff(daysFromCivil(date.year, date.month, date.day), date);
  }

  /**
   * Moves `count` business days forward (negative: backward). Each business day passed counts
   * one, whatever the starting day is: from a Saturday, `+1` is the following Monday. `0`
   * returns the input unchanged (even if it is not a business day). The time of day is kept.
   */
  addBusinessDays(date: DateTime, count: number): DateTime {
    assertDT(date, "date");
    if (!Number.isInteger(count))
      throw invalidArg(`count must be an integer, received ${String(count)}.`);
    if (count === 0) return date;
    const step = count > 0 ? 1 : -1;
    let remaining = Math.abs(count);
    let day = daysFromCivil(date.year, date.month, date.day);
    const start = day;
    const limit = remaining * MAX_STEPS_FACTOR + 1000;
    for (let i = 0; remaining > 0; i++) {
      if (i > limit) {
        throw new ChronexaError(
          "UNBOUNDED",
          "No business day found within a reasonable range; check that the weekend and holiday configuration leaves working days.",
        );
      }
      day += step;
      if (!this.#isOff(day, date)) remaining--;
    }
    return date.add({ days: day - start });
  }

  subtractBusinessDays(date: DateTime, count: number): DateTime {
    return this.addBusinessDays(date, -count);
  }

  /** The first business day strictly after `date`. */
  nextBusinessDay(date: DateTime): DateTime {
    return this.addBusinessDays(date, 1);
  }

  /** The last business day strictly before `date`. */
  previousBusinessDay(date: DateTime): DateTime {
    return this.addBusinessDays(date, -1);
  }

  /**
   * Counts business days in `[start, end)` by local date (`end` is viewed in `start`'s zone;
   * times of day are ignored). With `endInclusive`, `end`'s date counts too. Antisymmetric:
   * `count(a, b) === -count(b, a)` when `endInclusive` is `false`; if `end` is earlier than
   * `start` the result is the negative count of the swapped range, where the later date
   * is treated as the `end` for `endInclusive`.
   */
  countBusinessDays(start: DateTime, end: DateTime, options: CountOptions = {}): number {
    assertDT(start, "start");
    assertDT(end, "end");
    const a = daysFromCivil(start.year, start.month, start.day);
    const endHere = end.toZone(start.zone);
    const b = daysFromCivil(endHere.year, endHere.month, endHere.day);
    const [lo, hi, sign] = a <= b ? [a, b, 1] : [b, a, -1];
    const last = options.endInclusive ? hi : hi - 1;
    let n = 0;
    for (let d = lo; d <= last; d++) if (!this.#isOff(d, start)) n++;
    return sign * n;
  }

  /** The business days in `[start, end)` (or `[start, end]` with `endInclusive`) as `YYYY-MM-DD` strings. */
  listBusinessDays(start: DateTime, end: DateTime, options: CountOptions = {}): string[] {
    assertDT(start, "start");
    assertDT(end, "end");
    const a = daysFromCivil(start.year, start.month, start.day);
    const endHere = end.toZone(start.zone);
    const b = daysFromCivil(endHere.year, endHere.month, endHere.day);
    const out: string[] = [];
    for (let d = a; d <= (options.endInclusive ? b : b - 1); d++)
      if (!this.#isOff(d, start)) out.push(dateKey(d));
    return out;
  }
}
