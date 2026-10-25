import type { DateTime } from "./datetime.js";
import { ChronexaError, attempt, invalidArg, type Result } from "./result.js";
import { MS_PER_HOUR, MS_PER_MINUTE, MS_PER_SECOND } from "../utils/calendar.js";
import { assertFiniteNumber, checkLocale } from "../utils/validate.js";

/** Unit names used in method *arguments*. (Object keys use the plural {@link DurationUnitKey}.) */
export type DurationUnit =
  "year" | "month" | "week" | "day" | "hour" | "minute" | "second" | "millisecond";

export type DurationUnitKey =
  "years" | "months" | "weeks" | "days" | "hours" | "minutes" | "seconds" | "milliseconds";

/** A plain object of unit amounts, e.g. `{ days: 1, hours: 12 }`. */
export type DurationLike = { readonly [K in DurationUnitKey]?: number | undefined };

/** @internal */
export const UNIT_ORDER: readonly DurationUnit[] = [
  "year",
  "month",
  "week",
  "day",
  "hour",
  "minute",
  "second",
  "millisecond",
];

const KEY: Record<DurationUnit, DurationUnitKey> = {
  year: "years",
  month: "months",
  week: "weeks",
  day: "days",
  hour: "hours",
  minute: "minutes",
  second: "seconds",
  millisecond: "milliseconds",
};

const UNIT_FROM_KEY = Object.fromEntries(Object.entries(KEY).map(([u, k]) => [k, u])) as Record<
  DurationUnitKey,
  DurationUnit
>;

const TIME_MS = {
  hour: MS_PER_HOUR,
  minute: MS_PER_MINUTE,
  second: MS_PER_SECOND,
  millisecond: 1,
} as const;

/** @internal */
export function isDurationUnit(u: unknown): u is DurationUnit {
  return typeof u === "string" && Object.prototype.hasOwnProperty.call(KEY, u);
}

/** @internal */
export function assertUnit(u: unknown, what = "unit"): asserts u is DurationUnit {
  if (!isDurationUnit(u)) {
    throw invalidArg(
      `Unknown ${what} ${JSON.stringify(u)}; expected one of ${UNIT_ORDER.map((x) => `"${x}"`).join(", ")}.`,
    );
  }
}

export interface RelativeToOption {
  /**
   * Reference date that gives calendar units a concrete length. Required whenever the result
   * depends on the calendar (months, years, and — because of DST — days and weeks).
   */
  relativeTo?: DateTime | undefined;
}

export interface HumanizeOptions {
  locale?: string | undefined;
  /** Unit display, as in `Intl.NumberFormat`. Default `"long"`. */
  style?: "long" | "short" | "narrow" | undefined;
  /** Show at most this many (largest) non-zero units. */
  maxUnits?: number | undefined;
}

const ISO_DURATION =
  /^([-+])?P(?!$)(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?=\d)(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/;

/**
 * An immutable amount of time made of separate unit fields.
 *
 * **Fixed vs calendar units.** `hours`, `minutes`, `seconds` and `milliseconds` are *elapsed*
 * time and always have the same length. `years`, `months`, `weeks` and `days` are *calendar*
 * units: their length depends on the date they are applied to (a month is 28–31 days; a day
 * is 23, 24 or 25 hours across DST changes). Methods that would need to turn calendar units
 * into elapsed time demand a `relativeTo` date instead of guessing.
 *
 * Calendar units must be integers. Time units may be fractional.
 */
export class Duration {
  readonly years: number;
  readonly months: number;
  readonly weeks: number;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
  readonly milliseconds: number;

  private constructor(v: Record<DurationUnitKey, number>) {
    this.years = v.years;
    this.months = v.months;
    this.weeks = v.weeks;
    this.days = v.days;
    this.hours = v.hours;
    this.minutes = v.minutes;
    this.seconds = v.seconds;
    this.milliseconds = v.milliseconds;
    Object.freeze(this);
  }

  /** Builds a duration from an object, another duration, or an ISO 8601 duration string. */
  static from(input: DurationLike | Duration | string): Duration {
    if (input instanceof Duration) return input;
    if (typeof input === "string") return Duration.fromISO(input);
    if (input === null || typeof input !== "object") {
      throw invalidArg(`Cannot create a Duration from ${String(input)}.`);
    }
    const v: Record<DurationUnitKey, number> = {
      years: 0,
      months: 0,
      weeks: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    };
    for (const [key, value] of Object.entries(input)) {
      if (!(key in UNIT_FROM_KEY)) {
        throw invalidArg(
          `Unknown duration unit "${key}"; use the plural names: years, months, weeks, days, hours, minutes, seconds, milliseconds.`,
        );
      }
      if (value === undefined) continue;
      assertFiniteNumber(value, `duration.${key}`);
      const unit = UNIT_FROM_KEY[key as DurationUnitKey];
      if (UNIT_ORDER.indexOf(unit) <= 3 && !Number.isInteger(value)) {
        throw invalidArg(
          `duration.${key} must be an integer because calendar units have no fixed length (received ${value}). ` +
            `Express fractions in smaller fixed units, e.g. { hours: 36 }.`,
        );
      }
      v[key as DurationUnitKey] = value === 0 ? 0 : value; // normalise -0
    }
    return new Duration(v);
  }

  static fromMillis(ms: number): Duration {
    return Duration.from({ milliseconds: ms });
  }

  /**
   * Parses `PnYnMnWnDTnHnMnS` (optionally prefixed with `-` or `+`). Only seconds may be
   * fractional. Designators must appear in order; at least one component is required.
   */
  static fromISO(text: string): Duration {
    const m = typeof text === "string" ? ISO_DURATION.exec(text) : null;
    if (!m) {
      throw new ChronexaError(
        "PARSE_ERROR",
        `Cannot parse ${JSON.stringify(text)} as an ISO 8601 duration. Expected a form like "P1Y2M3DT4H5M6.5S" or "P2W"; ` +
          `components must be in order and at least one is required.`,
      );
    }
    const sign = m[1] === "-" ? -1 : 1;
    const n = (i: number) => (m[i] === undefined ? 0 : sign * Number(m[i]!.replace(",", ".")));
    return Duration.from({
      years: n(2),
      months: n(3),
      weeks: n(4),
      days: n(5),
      hours: n(6),
      minutes: n(7),
      seconds: n(8),
    });
  }

  static tryFromISO(text: string): Result<Duration> {
    return attempt(() => Duration.fromISO(text));
  }

  static isDuration(x: unknown): x is Duration {
    return x instanceof Duration;
  }

  get(unit: DurationUnit): number {
    assertUnit(unit);
    return this[KEY[unit]];
  }

  /** Plain object of the non-zero fields, e.g. `{ days: 1, hours: 12 }`. */
  toObject(): { [K in DurationUnitKey]?: number } {
    const out: { [K in DurationUnitKey]?: number } = {};
    for (const u of UNIT_ORDER) if (this[KEY[u]] !== 0) out[KEY[u]] = this[KEY[u]];
    return out;
  }

  get isZero(): boolean {
    return UNIT_ORDER.every((u) => this[KEY[u]] === 0);
  }

  /** True if any of years, months, weeks, days is non-zero (length depends on the calendar). */
  get hasCalendarUnits(): boolean {
    return this.years !== 0 || this.months !== 0 || this.weeks !== 0 || this.days !== 0;
  }

  /** `1` if every non-zero field is positive, `-1` if all negative, `0` if zero, `null` if the signs are mixed. */
  get sign(): 1 | -1 | 0 | null {
    let pos = false;
    let neg = false;
    for (const u of UNIT_ORDER) {
      const x = this[KEY[u]];
      if (x > 0) pos = true;
      else if (x < 0) neg = true;
    }
    if (pos && neg) return null;
    return pos ? 1 : neg ? -1 : 0;
  }

  add(other: DurationLike | Duration): Duration {
    const o = Duration.from(other);
    const v = {} as Record<DurationUnitKey, number>;
    for (const u of UNIT_ORDER) v[KEY[u]] = this[KEY[u]] + o[KEY[u]];
    return Duration.from(v);
  }

  subtract(other: DurationLike | Duration): Duration {
    return this.add(Duration.from(other).negate());
  }

  negate(): Duration {
    const v = {} as Record<DurationUnitKey, number>;
    for (const u of UNIT_ORDER) v[KEY[u]] = -this[KEY[u]];
    return Duration.from(v);
  }

  /** Returns a copy with the given fields replaced. */
  with(values: DurationLike): Duration {
    return Duration.from({ ...this.toObject(), ...values });
  }

  /**
   * Total elapsed milliseconds. Throws if the duration has calendar units and no `relativeTo`
   * is given, because "1 month" has no fixed length.
   */
  toMillis(options: RelativeToOption = {}): number {
    if (!this.hasCalendarUnits) return this.#fixedMs();
    const base = options.relativeTo;
    if (!base) {
      throw new ChronexaError(
        "UNSUPPORTED",
        `This duration contains calendar units (${Object.keys(this.toObject()).join(", ")}) whose length depends on the date. ` +
          `Pass { relativeTo: dateTime } to measure it from a specific starting point.`,
      );
    }
    return base.add(this).toMillis() - base.toMillis();
  }

  #fixedMs(): number {
    return (
      this.hours * MS_PER_HOUR +
      this.minutes * MS_PER_MINUTE +
      this.seconds * MS_PER_SECOND +
      this.milliseconds
    );
  }

  /**
   * Expresses the duration as a (possibly fractional) count of one unit.
   * `months`⇄`years` and `days`⇄`weeks` convert exactly; any conversion between the calendar
   * group and elapsed time, or between {days/weeks} and {months/years}, needs `relativeTo`.
   */
  as(unit: DurationUnit, options: RelativeToOption = {}): number {
    assertUnit(unit);
    if (unit in TIME_MS) {
      return this.toMillis(options) / TIME_MS[unit as keyof typeof TIME_MS];
    }
    const onlyMonthsYears = this.weeks === 0 && this.days === 0 && !this.#hasTime();
    const onlyDaysWeeks = this.months === 0 && this.years === 0 && !this.#hasTime();
    const totalMonths = this.years * 12 + this.months;
    const totalDays = this.weeks * 7 + this.days;
    if (onlyMonthsYears && (unit === "month" || unit === "year")) {
      return unit === "month" ? totalMonths : totalMonths / 12;
    }
    if (onlyDaysWeeks && (unit === "day" || unit === "week")) {
      return unit === "day" ? totalDays : totalDays / 7;
    }
    const base = options.relativeTo;
    if (!base) {
      throw new ChronexaError(
        "UNSUPPORTED",
        `Converting this duration to ${unit}s depends on the calendar. Pass { relativeTo: dateTime }.`,
      );
    }
    const end = base.add(this);
    const endMs = end.toMillis();
    const baseMs = base.toMillis();
    if (endMs === baseMs) return 0;
    const dir = endMs > baseMs ? 1 : -1;
    const whole = end.diff(base, unit).get(unit);
    const key = KEY[unit];
    const from = base.add({ [key]: whole }).toMillis();
    const next = base.add({ [key]: whole + dir }).toMillis();
    return whole + (dir * (endMs - from)) / (next - from);
  }

  #hasTime(): boolean {
    return this.hours !== 0 || this.minutes !== 0 || this.seconds !== 0 || this.milliseconds !== 0;
  }

  /**
   * Rebalances units without changing meaning and without a reference date:
   * time units cascade up to hours (90 minutes → 1 h 30 m), months into years (14 → 1 y 2 m)
   * and days into weeks. It never converts between the elapsed and calendar groups.
   * Within each group all fields end up with the same sign.
   */
  normalize(): Duration {
    const totalMs = this.#fixedMs();
    const absMs = Math.abs(totalMs);
    const s = Math.sign(totalMs);
    const hours = Math.floor(absMs / MS_PER_HOUR);
    const minutes = Math.floor((absMs % MS_PER_HOUR) / MS_PER_MINUTE);
    const seconds = Math.floor((absMs % MS_PER_MINUTE) / MS_PER_SECOND);
    const milliseconds = absMs % MS_PER_SECOND;

    const tm = this.years * 12 + this.months;
    const td = this.weeks * 7 + this.days;
    return Duration.from({
      years: Math.trunc(tm / 12),
      months: tm % 12,
      weeks: Math.trunc(td / 7),
      days: td % 7,
      hours: s * hours,
      minutes: s * minutes,
      seconds: s * seconds,
      milliseconds: s * milliseconds,
    });
  }

  /**
   * Redistributes the duration over exactly the given units, largest first. All but the last
   * unit are whole numbers; the last absorbs the fractional remainder.
   * Crossing between calendar and elapsed units requires `relativeTo`.
   */
  shiftTo(units: readonly DurationUnit[], options: RelativeToOption = {}): Duration {
    if (units.length === 0) throw invalidArg("shiftTo needs at least one unit.");
    units.forEach((u) => assertUnit(u));
    const sorted = [...new Set(units)].sort(
      (a, b) => UNIT_ORDER.indexOf(a) - UNIT_ORDER.indexOf(b),
    );
    const inTimeGroup = (u: DurationUnit) => u in TIME_MS;
    const allFixed = sorted.every(inTimeGroup) && !this.hasCalendarUnits;
    const monthYear = (u: DurationUnit) => u === "month" || u === "year";
    const dayWeek = (u: DurationUnit) => u === "day" || u === "week";
    const selfIsMonthYearOnly = this.weeks === 0 && this.days === 0 && !this.#hasTime();
    const selfIsDayWeekOnly = this.months === 0 && this.years === 0 && !this.#hasTime();

    if (allFixed) return fromRemainder(this.#fixedMs(), sorted, TIME_MS);
    if (sorted.every(monthYear) && selfIsMonthYearOnly) {
      return fromRemainder(this.years * 12 + this.months, sorted, { year: 12, month: 1 });
    }
    if (sorted.every(dayWeek) && selfIsDayWeekOnly) {
      return fromRemainder(this.weeks * 7 + this.days, sorted, { week: 7, day: 1 });
    }
    const base = options.relativeTo;
    if (!base) {
      throw new ChronexaError(
        "UNSUPPORTED",
        `Shifting between calendar and elapsed units (or between months and days) depends on the date. Pass { relativeTo: dateTime }.`,
      );
    }
    return base.add(this).diff(base, sorted, { fractional: true });
  }

  /**
   * Compares two durations. Elapsed-only durations compare by length; anything involving
   * calendar units needs `relativeTo`. Returns -1, 0 or 1.
   */
  compare(other: DurationLike | Duration, options: RelativeToOption = {}): -1 | 0 | 1 {
    const o = Duration.from(other);
    const a = this.toMillis(options);
    const b = o.toMillis(options);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /**
   * Structural equality after {@link Duration.normalize}: `PT90M` equals `PT1H30M`, but
   * `P1M` does not equal `P30D` (they are different calendar quantities).
   */
  equals(other: DurationLike | Duration): boolean {
    const a = this.normalize();
    const b = Duration.from(other).normalize();
    return UNIT_ORDER.every((u) => a[KEY[u]] === b[KEY[u]]);
  }

  /**
   * ISO 8601 duration. Weeks are emitted as `PnW` when alone, otherwise folded into days.
   * Throws if the fields have mixed signs (ISO 8601 has no portable form for that).
   */
  toISO(): string {
    if (this.isZero) return "PT0S";
    const sgn = this.sign;
    if (sgn === null) {
      throw new ChronexaError(
        "UNSUPPORTED",
        "A duration with mixed-sign fields has no portable ISO 8601 form. Call normalize() first or split it.",
      );
    }
    const d = this.abs();
    const only = (u: DurationUnit) => UNIT_ORDER.every((x) => x === u || d[KEY[x]] === 0);
    let out = sgn < 0 ? "-P" : "P";
    if (only("week")) return `${out}${d.weeks}W`;
    const days = d.days + d.weeks * 7;
    if (d.years) out += `${d.years}Y`;
    if (d.months) out += `${d.months}M`;
    if (days) out += `${days}D`;
    const secs = d.seconds + d.milliseconds / 1000;
    if (d.hours || d.minutes || secs) {
      out += "T";
      if (d.hours) out += `${d.hours}H`;
      if (d.minutes) out += `${d.minutes}M`;
      if (secs) out += `${trimFloat(secs)}S`;
    }
    return out;
  }

  /** Human-readable text via `Intl.NumberFormat` + `Intl.ListFormat`, e.g. `"1 day, 12 hours"`. */
  toHuman(options: HumanizeOptions = {}): string {
    const locale = checkLocale(options.locale);
    const style = options.style ?? "long";
    let parts = UNIT_ORDER.filter((u) => this[KEY[u]] !== 0);
    if (options.maxUnits !== undefined) parts = parts.slice(0, Math.max(1, options.maxUnits));
    if (parts.length === 0) parts = ["second"];
    const formatted = parts.map((u) =>
      new Intl.NumberFormat(locale, { style: "unit", unit: u, unitDisplay: style }).format(
        this[KEY[u]],
      ),
    );
    return new Intl.ListFormat(locale, { type: "unit", style }).format(formatted);
  }

  toJSON(): string {
    return this.toISO();
  }

  toString(): string {
    return this.toISO();
  }

  private abs(): Duration {
    return this.sign === -1 ? this.negate() : this;
  }
}

function trimFloat(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

function fromRemainder(
  total: number,
  units: readonly DurationUnit[],
  size: Partial<Record<DurationUnit, number>>,
): Duration {
  const out: Record<string, number> = {};
  let rest = total;
  units.forEach((u, i) => {
    const s = size[u] as number;
    if (i === units.length - 1) {
      out[KEY[u]] = rest / s;
    } else {
      const whole = Math.trunc(rest / s);
      out[KEY[u]] = whole;
      rest -= whole * s;
    }
  });
  return Duration.from(out as DurationLike);
}
