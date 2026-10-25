import { formatPattern, type FormatContext } from "../formatting/format.js";
import {
  toRelative,
  toRelativeCalendar,
  type RelativeCalendarUnit,
  type RelativeOptions,
} from "../formatting/relative.js";
import { parseWithFormat, weekdayMismatch } from "../parsing/custom.js";
import { parseISO } from "../parsing/iso.js";
import {
  fixedZoneFromMs,
  formatOffset,
  Zone,
  type Disambiguation,
  type ZoneLike,
} from "../timezone/zone.js";
import {
  civilFromDays,
  dayOfYear,
  daysFromCivil,
  daysInMonth,
  daysInYear,
  fieldsFromLocalMs,
  isLeapYear,
  isoWeekday,
  isoWeekOf,
  localMsFromFields,
  MAX_EPOCH_MS,
  mod,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  timeOfDayMs,
  weeksInIsoYear,
  type LocalFields,
} from "../utils/calendar.js";
import { assertValidFields, checkLocale } from "../utils/validate.js";
import {
  Duration,
  assertUnit,
  UNIT_ORDER,
  type DurationLike,
  type DurationUnit,
} from "./duration.js";
import { ChronexaError, attempt, invalidArg, type Result } from "./result.js";
import { Settings } from "./settings.js";

/** Units accepted by `startOf`, `endOf` and `isSame`. */
export type DateTimeUnit = DurationUnit | "quarter";

/** Local wall-clock components. Only `year` is required; the rest default to their minimum. */
export interface DateTimeComponents {
  year: number;
  month?: number | undefined;
  day?: number | undefined;
  hour?: number | undefined;
  minute?: number | undefined;
  second?: number | undefined;
  millisecond?: number | undefined;
}

/** Fully specified local wall-clock components, as returned by `DateTime.toObject()`. */
export interface LocalDateTimeObject {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export interface DateTimeOptions {
  /** Zone the instance lives in. Default: `Settings.defaultZone` (the system zone). */
  zone?: ZoneLike | undefined;
  /** BCP 47 locale for formatting. Default: `Settings.defaultLocale`. */
  locale?: string | undefined;
}

export interface ResolveOptions extends DateTimeOptions {
  /** How to handle local times that are ambiguous or nonexistent. Default `"compatible"`. */
  disambiguation?: Disambiguation | undefined;
}

export interface ParseISOOptions extends ResolveOptions {
  /**
   * If the text contains an offset, keep it as the zone (`Z` → UTC, `+02:00` → fixed offset)
   * instead of converting to `zone`. Ignored when the text has no offset.
   */
  setZone?: boolean | undefined;
}

export interface ParseFormatOptions extends ParseISOOptions {
  /** Values for components the format does not capture. `year` has no default. */
  defaults?: Partial<DateTimeComponents> | undefined;
}

export interface ToISOOptions {
  /** `"extended"` (`2024-01-02T03:04:05Z`, default) or `"basic"` (`20240102T030405Z`). */
  format?: "extended" | "basic" | undefined;
  /** Omit the `.SSS` part when milliseconds are zero. */
  suppressMilliseconds?: boolean | undefined;
  /** Omit seconds (and milliseconds) when both are zero. */
  suppressSeconds?: boolean | undefined;
  /** Append the UTC offset (default `true`). Without it the string is a local wall time. */
  includeOffset?: boolean | undefined;
}

export interface WeekOptions {
  /** First day of the week, ISO weekday number (1 = Monday … 7 = Sunday). Default 1. */
  weekStart?: number | undefined;
}

export interface DiffOptions {
  /** Let the smallest *elapsed* unit (hour…millisecond) carry a fractional remainder. */
  fractional?: boolean | undefined;
}

const COMPONENT_KEYS: readonly string[] = [
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
  "millisecond",
];

const ELAPSED_MS = {
  hour: MS_PER_HOUR,
  minute: MS_PER_MINUTE,
  second: MS_PER_SECOND,
  millisecond: 1,
} as const;

interface Local extends LocalFields {
  offsetMs: number;
}

function assertEpoch(ms: number): number {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    throw invalidArg(`Epoch milliseconds must be a finite number, received ${String(ms)}.`);
  }
  if (!Number.isInteger(ms)) {
    throw invalidArg(
      `Epoch milliseconds must be an integer, received ${ms}. Chronexa has millisecond resolution.`,
    );
  }
  if (Math.abs(ms) > MAX_EPOCH_MS) {
    throw new ChronexaError(
      "OUT_OF_RANGE",
      `The instant ${ms} is outside the supported range of ±8.64e15 ms (years −271821 to 275760).`,
    );
  }
  return ms;
}

function exactMs(delta: number): number {
  const cleaned = Math.round(delta * 1e6) / 1e6; // removes float noise like 1.1 * 1000
  if (!Number.isInteger(cleaned)) {
    throw invalidArg(`The duration resolves to ${delta} ms; Chronexa has millisecond resolution.`);
  }
  return cleaned;
}

function assertDateTime(x: unknown, name = "argument"): asserts x is DateTime {
  if (!(x instanceof DateTime)) throw invalidArg(`${name} must be a DateTime.`);
}

function assertWeekStart(ws: number): number {
  if (!Number.isInteger(ws) || ws < 1 || ws > 7) {
    throw invalidArg(
      `weekStart must be an ISO weekday number from 1 (Monday) to 7 (Sunday), received ${String(ws)}.`,
    );
  }
  return ws;
}

const intlCache = new Map<string, Intl.DateTimeFormat>();

/**
 * An instant on the global timeline, viewed through a time zone and a locale.
 *
 * Instances are immutable and always valid: every factory either returns a usable
 * `DateTime` or throws a {@link ChronexaError} (or, for the `try*` variants, returns a
 * {@link Result}). Nothing is ever silently rolled over (February 30 is an error).
 *
 * Internally a `DateTime` is one integer, the epoch milliseconds, plus a zone. The local
 * calendar fields (`year`, `hour`, …) are derived from those two and cached.
 */
export class DateTime {
  readonly #ms: number;
  readonly #zone: Zone;
  readonly #locale: string | undefined;
  #local: Local | undefined;

  private constructor(ms: number, zone: Zone, locale: string | undefined) {
    this.#ms = ms;
    this.#zone = zone;
    this.#locale = locale;
  }

  // ───────────────────────────── construction ─────────────────────────────

  /** The current instant according to `Settings.now` (the system clock by default). */
  static now(options: DateTimeOptions = {}): DateTime {
    return DateTime.fromMillis(Settings.now(), options);
  }

  /** From epoch milliseconds (must be an integer within ±8.64e15). */
  static fromMillis(ms: number, options: DateTimeOptions = {}): DateTime {
    return new DateTime(assertEpoch(ms), DateTime.#zoneOf(options), DateTime.#localeOf(options));
  }

  /** From epoch seconds (may be fractional down to the millisecond). */
  static fromSeconds(seconds: number, options: DateTimeOptions = {}): DateTime {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
      throw invalidArg(`Epoch seconds must be a finite number, received ${String(seconds)}.`);
    }
    return DateTime.fromMillis(exactMs(seconds * 1000), options);
  }

  /** From a JavaScript `Date`. An invalid `Date` throws. */
  static fromJSDate(date: Date, options: DateTimeOptions = {}): DateTime {
    if (!(date instanceof Date)) throw invalidArg("fromJSDate expects a Date instance.");
    const ms = date.getTime();
    if (Number.isNaN(ms))
      throw new ChronexaError(
        "INVALID_DATE",
        "Cannot convert an invalid Date (its time value is NaN).",
      );
    return DateTime.fromMillis(ms, options);
  }

  /**
   * From local wall-clock components in `options.zone`. Components are validated strictly
   * (month 1–12, day within the month, hour 0–23 …); out-of-range values throw rather than roll over.
   * If the wall time is ambiguous or nonexistent in the zone, `options.disambiguation` decides.
   */
  static fromObject(components: DateTimeComponents, options: ResolveOptions = {}): DateTime {
    if (components === null || typeof components !== "object") {
      throw invalidArg("fromObject expects an object like { year: 2024, month: 3, day: 9 }.");
    }
    for (const k of Object.keys(components)) {
      if (!COMPONENT_KEYS.includes(k)) {
        throw invalidArg(`Unknown component "${k}"; expected ${COMPONENT_KEYS.join(", ")}.`);
      }
    }
    const f: LocalFields = {
      year: components.year,
      month: components.month ?? 1,
      day: components.day ?? 1,
      hour: components.hour ?? 0,
      minute: components.minute ?? 0,
      second: components.second ?? 0,
      millisecond: components.millisecond ?? 0,
    };
    assertValidFields(f);
    const zone = DateTime.#zoneOf(options);
    const ms = zone.resolveLocal(localMsFromFields(f), options.disambiguation);
    return new DateTime(assertEpoch(ms), zone, DateTime.#localeOf(options));
  }

  /**
   * Parses an ISO 8601 string strictly (see docs/parsing.md for the supported grammar).
   *
   * - Text **with** an offset (`Z`, `+02:00`) names an absolute instant; it is shown in
   *   `options.zone` unless `setZone: true`.
   * - Text **without** an offset is a local wall time in `options.zone` (default: system zone).
   */
  static fromISO(text: string, options: ParseISOOptions = {}): DateTime {
    const p = parseISO(text);
    const locale = DateTime.#localeOf(options);
    const localMs = localMsFromFields(p.fields);
    if (p.offsetMs !== null) {
      const zone = options.setZone
        ? p.isZ
          ? Zone.utc
          : fixedZoneFromMs(p.offsetMs)
        : DateTime.#zoneOf(options);
      return new DateTime(assertEpoch(localMs - p.offsetMs), zone, locale);
    }
    const zone = DateTime.#zoneOf(options);
    return new DateTime(
      assertEpoch(zone.resolveLocal(localMs, options.disambiguation)),
      zone,
      locale,
    );
  }

  /**
   * Parses text with a custom pattern (see docs/parsing.md for the token table). The whole
   * string must match. Missing components default to their minimum except `year`, which must
   * be captured or supplied in `options.defaults`.
   */
  static fromFormat(text: string, format: string, options: ParseFormatOptions = {}): DateTime {
    const locale = DateTime.#localeOf(options);
    const p = parseWithFormat(text, format, locale);
    if (p.epochMs !== undefined) return DateTime.fromMillis(p.epochMs, options);

    const d = options.defaults ?? {};
    const year = p.year ?? d.year;
    if (year === undefined) {
      throw new ChronexaError(
        "PARSE_ERROR",
        `The format ${JSON.stringify(format)} does not capture a year. Include "yyyy" or pass { defaults: { year } }.`,
      );
    }
    const f: LocalFields = {
      year,
      month: p.month ?? d.month ?? 1,
      day: p.day ?? d.day ?? 1,
      hour: p.hour ?? d.hour ?? 0,
      minute: p.minute ?? d.minute ?? 0,
      second: p.second ?? d.second ?? 0,
      millisecond: p.millisecond ?? d.millisecond ?? 0,
    };
    assertValidFields(f);
    if (p.weekday !== undefined && weekdayMismatch(f.year, f.month, f.day, p.weekday)) {
      throw new ChronexaError(
        "INVALID_DATE",
        `The weekday in ${JSON.stringify(text)} does not match the date ${f.year}-${String(f.month).padStart(2, "0")}-${String(f.day).padStart(2, "0")}.`,
      );
    }
    const localMs = localMsFromFields(f);
    const target = options.setZone ? undefined : DateTime.#zoneOf(options);
    if (p.offsetMs !== undefined) {
      const zone = options.setZone
        ? p.offsetMs === 0
          ? fixedZoneFromMs(0)
          : fixedZoneFromMs(p.offsetMs)
        : target!;
      return new DateTime(assertEpoch(localMs - p.offsetMs), zone, locale);
    }
    if (p.zone) {
      const ms = p.zone.resolveLocal(localMs, options.disambiguation);
      return new DateTime(assertEpoch(ms), options.setZone ? p.zone : target!, locale);
    }
    const zone = DateTime.#zoneOf(options);
    return new DateTime(
      assertEpoch(zone.resolveLocal(localMs, options.disambiguation)),
      zone,
      locale,
    );
  }

  static tryFromISO(text: string, options?: ParseISOOptions): Result<DateTime> {
    return attempt(() => DateTime.fromISO(text, options));
  }

  static tryFromFormat(
    text: string,
    format: string,
    options?: ParseFormatOptions,
  ): Result<DateTime> {
    return attempt(() => DateTime.fromFormat(text, format, options));
  }

  static tryFromObject(components: DateTimeComponents, options?: ResolveOptions): Result<DateTime> {
    return attempt(() => DateTime.fromObject(components, options));
  }

  static isDateTime(x: unknown): x is DateTime {
    return x instanceof DateTime;
  }

  static #zoneOf(o: DateTimeOptions): Zone {
    return o.zone === undefined ? Settings.defaultZone : Zone.from(o.zone);
  }

  static #localeOf(o: DateTimeOptions): string | undefined {
    return o.locale === undefined ? Settings.defaultLocale : checkLocale(o.locale);
  }

  // ─────────────────────────── local calendar fields ───────────────────────────

  get #f(): Local {
    let l = this.#local;
    if (!l) {
      const offsetMs = this.#zone.offsetAt(this.#ms);
      l = { ...fieldsFromLocalMs(this.#ms + offsetMs), offsetMs };
      this.#local = l;
    }
    return l;
  }

  get zone(): Zone {
    return this.#zone;
  }
  get locale(): string | undefined {
    return this.#locale;
  }
  get year(): number {
    return this.#f.year;
  }
  /** 1–12. */
  get month(): number {
    return this.#f.month;
  }
  /** 1–31. */
  get day(): number {
    return this.#f.day;
  }
  get hour(): number {
    return this.#f.hour;
  }
  get minute(): number {
    return this.#f.minute;
  }
  get second(): number {
    return this.#f.second;
  }
  get millisecond(): number {
    return this.#f.millisecond;
  }
  /** ISO weekday: 1 = Monday … 7 = Sunday. */
  get weekday(): number {
    const f = this.#f;
    return isoWeekday(f.year, f.month, f.day);
  }
  /** Day of the year, 1–366. */
  get ordinal(): number {
    const f = this.#f;
    return dayOfYear(f.year, f.month, f.day);
  }
  /** 1–4. */
  get quarter(): number {
    return Math.ceil(this.#f.month / 3);
  }
  /** ISO 8601 week-numbering year (may differ from `year` in early January / late December). */
  get weekYear(): number {
    const f = this.#f;
    return isoWeekOf(f.year, f.month, f.day).weekYear;
  }
  /** ISO 8601 week number, 1–53 (weeks start on Monday; week 1 contains January 4th). */
  get weekNumber(): number {
    const f = this.#f;
    return isoWeekOf(f.year, f.month, f.day).weekNumber;
  }
  get weeksInWeekYear(): number {
    return weeksInIsoYear(this.weekYear);
  }
  get daysInMonth(): number {
    return daysInMonth(this.#f.year, this.#f.month);
  }
  get daysInYear(): number {
    return daysInYear(this.#f.year);
  }
  get isLeapYear(): boolean {
    return isLeapYear(this.#f.year);
  }
  /** UTC offset in minutes at this instant (positive east of Greenwich). */
  get offset(): number {
    return this.#f.offsetMs / MS_PER_MINUTE;
  }
  /**
   * Whether this instant is in daylight-saving time. Heuristic for named zones: the offset
   * is larger than the smaller of the zone's offsets on 1 January and 1 July of this year.
   * Always `false` for UTC and fixed offsets.
   */
  get isInDST(): boolean {
    if (this.#zone.kind !== "iana") return false;
    const y = this.#f.year;
    const jan = this.#zone.offsetAt(daysFromCivil(y, 1, 1) * MS_PER_DAY);
    const jul = this.#zone.offsetAt(daysFromCivil(y, 7, 1) * MS_PER_DAY);
    return jan !== jul && this.#f.offsetMs === Math.max(jan, jul);
  }

  // ───────────────────────────────── conversion ─────────────────────────────────

  toMillis(): number {
    return this.#ms;
  }

  /** Whole epoch seconds, rounded toward negative infinity (Unix-time convention). */
  toSeconds(): number {
    return Math.floor(this.#ms / 1000);
  }

  toJSDate(): Date {
    return new Date(this.#ms);
  }

  /** Epoch milliseconds, so `a < b` and `b - a` work. */
  valueOf(): number {
    return this.#ms;
  }

  /** The local wall-clock components in this instance's zone. */
  toObject(): LocalDateTimeObject {
    const { year, month, day, hour, minute, second, millisecond } = this.#f;
    return { year, month, day, hour, minute, second, millisecond };
  }

  /** Same instant, shown in another zone. */
  toZone(zone: ZoneLike): DateTime {
    return new DateTime(this.#ms, Zone.from(zone), this.#locale);
  }

  toUTC(): DateTime {
    return new DateTime(this.#ms, Zone.utc, this.#locale);
  }

  /** Same instant in the runtime's system zone. */
  toLocal(): DateTime {
    return new DateTime(this.#ms, Zone.system(), this.#locale);
  }

  withLocale(locale: string | undefined): DateTime {
    return new DateTime(this.#ms, this.#zone, checkLocale(locale));
  }

  // ───────────────────────────────── serialization ─────────────────────────────────

  /**
   * ISO 8601 string. Years outside 0000–9999 use the expanded `±YYYYYY` form. UTC zones
   * print `Z`; other zones print their offset at this instant.
   */
  toISO(options: ToISOOptions = {}): string {
    const basic = options.format === "basic";
    const date = this.#isoDate(basic);
    const time = this.#isoTime(options, basic);
    return `${date}T${time}`;
  }

  /** Local calendar date, `YYYY-MM-DD`. */
  toISODate(options: Pick<ToISOOptions, "format"> = {}): string {
    return this.#isoDate(options.format === "basic");
  }

  /** Local time with offset, `HH:mm:ss.SSS±hh:mm`. */
  toISOTime(options: ToISOOptions = {}): string {
    return this.#isoTime(options, options.format === "basic");
  }

  #isoDate(basic: boolean): string {
    const f = this.#f;
    const y =
      f.year >= 0 && f.year <= 9999
        ? String(f.year).padStart(4, "0")
        : `${f.year < 0 ? "-" : "+"}${String(Math.abs(f.year)).padStart(6, "0")}`;
    const sep = basic ? "" : "-";
    return `${y}${sep}${String(f.month).padStart(2, "0")}${sep}${String(f.day).padStart(2, "0")}`;
  }

  #isoTime(o: ToISOOptions, basic: boolean): string {
    const f = this.#f;
    const p = (n: number) => String(n).padStart(2, "0");
    const sep = basic ? "" : ":";
    let t = `${p(f.hour)}${sep}${p(f.minute)}`;
    const dropSeconds = o.suppressSeconds && f.second === 0 && f.millisecond === 0;
    if (!dropSeconds) {
      t += `${sep}${p(f.second)}`;
      if (!(o.suppressMilliseconds && f.millisecond === 0))
        t += `.${String(f.millisecond).padStart(3, "0")}`;
    }
    if (o.includeOffset === false) return t;
    return (
      t + (this.#zone.kind === "utc" ? "Z" : formatOffset(f.offsetMs, basic ? "basic" : "extended"))
    );
  }

  toJSON(): string {
    return this.toISO();
  }

  toString(): string {
    return this.toISO();
  }

  // ───────────────────────────────── formatting ─────────────────────────────────

  /**
   * Formats with the Chronexa token language (`"yyyy-MM-dd HH:mm"`; literals in `[brackets]`).
   * See `FORMAT_TOKENS`. Names (months, weekdays, am/pm) come from `Intl` for `options.locale`.
   */
  format(pattern: string, options: { locale?: string | undefined } = {}): string {
    const f = this.#f;
    const locale = options.locale === undefined ? this.#locale : checkLocale(options.locale);
    const wk = isoWeekOf(f.year, f.month, f.day);
    const ctx: FormatContext = {
      ...f,
      epochMs: this.#ms,
      zone: this.#zone,
      locale,
      weekday: isoWeekday(f.year, f.month, f.day),
      ordinal: dayOfYear(f.year, f.month, f.day),
      quarter: Math.ceil(f.month / 3),
      weekYear: wk.weekYear,
      weekNumber: wk.weekNumber,
    };
    return formatPattern(pattern, ctx);
  }

  /**
   * Locale-aware formatting through `Intl.DateTimeFormat`, in this instance's zone.
   * Output depends on the runtime's ICU data. `options.timeZone` is not accepted; call
   * `toZone()` instead. `timeZoneName` is unavailable for fixed-offset zones.
   */
  toLocaleString(
    options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
    locale?: string,
  ): string {
    if (options.timeZone !== undefined) {
      throw invalidArg(
        "Do not pass timeZone to toLocaleString; convert with toZone() so the zone is explicit.",
      );
    }
    const loc = locale === undefined ? this.#locale : checkLocale(locale);
    const z = this.#zone;
    let tz: string;
    let instant = this.#ms;
    if (z.kind === "iana") tz = z.name;
    else {
      if (z.kind === "fixed" && options.timeZoneName !== undefined) {
        throw new ChronexaError(
          "UNSUPPORTED",
          "timeZoneName cannot be shown for fixed-offset zones; use format() with the Z/ZZ tokens.",
        );
      }
      tz = "UTC";
      instant += this.#f.offsetMs;
    }
    const key = `${loc ?? ""}|${tz}|${JSON.stringify(options)}`;
    let fmt = intlCache.get(key);
    if (!fmt) {
      if (intlCache.size > 300) intlCache.clear();
      fmt = new Intl.DateTimeFormat(loc, { ...options, timeZone: tz });
      intlCache.set(key, fmt);
    }
    return fmt.format(instant);
  }

  /** "3 hours ago", "in 2 days". See {@link RelativeOptions}. Requires `Intl.RelativeTimeFormat`. */
  toRelative(options: RelativeOptions = {}): string {
    return toRelative(
      this,
      options.base ?? DateTime.now({ zone: this.#zone }),
      this.#locale,
      options,
    );
  }

  /** "yesterday", "tomorrow", "last month", compared by calendar period rather than elapsed time. */
  toRelativeCalendar(
    options: Omit<RelativeOptions, "unit"> & { unit?: RelativeCalendarUnit | undefined } = {},
  ): string {
    return toRelativeCalendar(
      this,
      options.base ?? DateTime.now({ zone: this.#zone }),
      this.#locale,
      options,
    );
  }

  // ───────────────────────────────── arithmetic ─────────────────────────────────

  /**
   * Adds a duration.
   *
   * Calendar units (years, months, weeks, days) move the **local wall clock**: adding one day
   * at 09:00 gives 09:00 the next day even if that day has 23 or 25 hours. Months and years
   * clamp to the end of the month (Jan 31 + 1 month = Feb 28/29). Elapsed units (hours …
   * milliseconds) are then added to the instant. If the calendar step lands on an ambiguous or
   * nonexistent local time, `disambiguation` applies (an ambiguous result prefers the occurrence
   * with the current offset).
   */
  add(
    duration: DurationLike | Duration,
    options: { disambiguation?: Disambiguation | undefined } = {},
  ): DateTime {
    const d = Duration.from(duration);
    if (d.isZero) return this;
    let ms = this.#ms;
    if (d.hasCalendarUnits) {
      const f = this.#f;
      const totalMonths = f.year * 12 + (f.month - 1) + d.years * 12 + d.months;
      const year = Math.floor(totalMonths / 12);
      const month = mod(totalMonths, 12) + 1;
      const day = Math.min(f.day, daysInMonth(year, month));
      const days = daysFromCivil(year, month, day) + d.weeks * 7 + d.days;
      ms = this.#zone.resolveLocal(
        days * MS_PER_DAY + timeOfDayMs(f),
        options.disambiguation,
        f.offsetMs,
      );
    }
    const elapsed =
      d.hours * MS_PER_HOUR +
      d.minutes * MS_PER_MINUTE +
      d.seconds * MS_PER_SECOND +
      d.milliseconds;
    if (elapsed !== 0) ms += exactMs(elapsed);
    return new DateTime(assertEpoch(ms), this.#zone, this.#locale);
  }

  subtract(
    duration: DurationLike | Duration,
    options: { disambiguation?: Disambiguation | undefined } = {},
  ): DateTime {
    return this.add(Duration.from(duration).negate(), options);
  }

  /**
   * Replaces local components. Unlike `add`, nothing is clamped or rolled over: setting
   * `day: 31` on a 30-day month throws. Use `add` for clamping calendar arithmetic.
   */
  set(
    components: Partial<DateTimeComponents>,
    options: { disambiguation?: Disambiguation | undefined } = {},
  ): DateTime {
    for (const k of Object.keys(components)) {
      if (!COMPONENT_KEYS.includes(k))
        throw invalidArg(`Unknown component "${k}"; expected ${COMPONENT_KEYS.join(", ")}.`);
    }
    const f = this.#f;
    const next: LocalFields = {
      year: components.year ?? f.year,
      month: components.month ?? f.month,
      day: components.day ?? f.day,
      hour: components.hour ?? f.hour,
      minute: components.minute ?? f.minute,
      second: components.second ?? f.second,
      millisecond: components.millisecond ?? f.millisecond,
    };
    assertValidFields(next);
    const ms = this.#zone.resolveLocal(localMsFromFields(next), options.disambiguation, f.offsetMs);
    return new DateTime(assertEpoch(ms), this.#zone, this.#locale);
  }

  /**
   * Start of the calendar unit containing this instant, in this zone. Weeks start on Monday
   * unless `weekStart` says otherwise. If local midnight does not exist (some zones skip it
   * at DST changes) the first valid instant after the gap is returned.
   */
  startOf(unit: DateTimeUnit, options: WeekOptions = {}): DateTime {
    DateTime.#assertDateTimeUnit(unit);
    if (unit === "millisecond") return this;
    const f = this.#f;
    let { year, month, day } = f;
    let hour = 0,
      minute = 0,
      second = 0;
    switch (unit) {
      case "year":
        month = 1;
        day = 1;
        break;
      case "quarter":
        month = Math.floor((month - 1) / 3) * 3 + 1;
        day = 1;
        break;
      case "month":
        day = 1;
        break;
      case "week": {
        const ws = assertWeekStart(options.weekStart ?? 1);
        const days = daysFromCivil(year, month, day) - mod(isoWeekday(year, month, day) - ws, 7);
        ({ year, month, day } = civilFromDays(days));
        break;
      }
      case "day":
        break;
      case "hour":
        hour = f.hour;
        break;
      case "minute":
        hour = f.hour;
        minute = f.minute;
        break;
      case "second":
        hour = f.hour;
        minute = f.minute;
        second = f.second;
        break;
    }
    const localMs = localMsFromFields({ year, month, day, hour, minute, second, millisecond: 0 });
    return new DateTime(
      assertEpoch(this.#zone.resolveLocal(localMs, "compatible", f.offsetMs)),
      this.#zone,
      this.#locale,
    );
  }

  /**
   * The last millisecond of the calendar unit containing this instant. It is the instant just
   * before the *nominal* start of the next unit, so it stays inside the unit even when a
   * local midnight is skipped by the zone. `hour`, `minute` and `second` use elapsed
   * boundaries (start + 1 unit), which differs from wall-clock boundaries only in the rare
   * zones whose offset changes by a non-whole hour mid-hour.
   */
  endOf(unit: DateTimeUnit, options: WeekOptions = {}): DateTime {
    DateTime.#assertDateTimeUnit(unit);
    if (unit === "millisecond") return this;
    if (unit === "hour" || unit === "minute" || unit === "second") {
      const size = ELAPSED_MS[unit];
      return new DateTime(this.startOf(unit).#ms + size - 1, this.#zone, this.#locale);
    }
    const { year, month, day } = this.#f;
    let next: { year: number; month: number; day: number };
    switch (unit) {
      case "year":
        next = { year: year + 1, month: 1, day: 1 };
        break;
      case "quarter":
      case "month": {
        const idx = year * 12 + (month - 1) + (unit === "quarter" ? 3 - mod(month - 1, 3) : 1);
        next = { year: Math.floor(idx / 12), month: mod(idx, 12) + 1, day: 1 };
        break;
      }
      case "week": {
        const ws = assertWeekStart(options.weekStart ?? 1);
        const first = daysFromCivil(year, month, day) - mod(isoWeekday(year, month, day) - ws, 7);
        next = civilFromDays(first + 7);
        break;
      }
      default:
        next = civilFromDays(daysFromCivil(year, month, day) + 1);
    }
    const localMs = localMsFromFields({ ...next, hour: 0, minute: 0, second: 0, millisecond: 0 });
    const ms = this.#zone.resolveLocal(localMs, "compatible");
    return new DateTime(assertEpoch(ms - 1), this.#zone, this.#locale);
  }

  static #assertDateTimeUnit(unit: unknown): asserts unit is DateTimeUnit {
    if (unit !== "quarter") assertUnit(unit);
  }

  // ───────────────────────────────── comparison ─────────────────────────────────

  /** `-1`, `0` or `1` by instant; zone and locale are ignored. */
  compare(other: DateTime): -1 | 0 | 1 {
    assertDateTime(other, "other");
    return this.#ms < other.#ms ? -1 : this.#ms > other.#ms ? 1 : 0;
  }

  /** Same instant (zone and locale are ignored). */
  equals(other: DateTime): boolean {
    assertDateTime(other, "other");
    return this.#ms === other.#ms;
  }

  isBefore(other: DateTime): boolean {
    assertDateTime(other, "other");
    return this.#ms < other.#ms;
  }

  isAfter(other: DateTime): boolean {
    assertDateTime(other, "other");
    return this.#ms > other.#ms;
  }

  /**
   * True if both fall in the same calendar `unit`, judged in **this** instance's zone
   * (`other` is converted first).
   */
  isSame(other: DateTime, unit: DateTimeUnit, options: WeekOptions = {}): boolean {
    assertDateTime(other, "other");
    return (
      this.startOf(unit, options).#ms ===
      new DateTime(other.#ms, this.#zone, undefined).startOf(unit, options).#ms
    );
  }

  // ───────────────────────────────── differences ─────────────────────────────────

  /**
   * `this − other` as a {@link Duration} spread over the given units, **truncated** to whole
   * units (the smallest unit too, unless `fractional` is set for an elapsed unit).
   *
   * Calendar units (year, month, week, day) are counted on the wall clock of this zone:
   * the answer is the number of whole units `n` such that `other + n units ≤ this`. Elapsed
   * units (hour … millisecond) measure real time. For example `diff(x, ["month","day"])`
   * might give `{ months: 1, days: 3 }`. Month arithmetic clamps like `add` does, so
   * Jan 31 → Mar 1 is 1 month 1 day. Both ends are viewed in this instance's zone.
   * Signs follow `this − other`: negative when `this` is earlier. The result is always measured
   * forward from the earlier instant, so `earlier.add(later.diff(earlier))` equals `later`
   * when the units include `millisecond` (calendar units are applied in the receiver's zone).
   */
  diff(
    other: DateTime,
    units: DurationUnit | readonly DurationUnit[],
    options: DiffOptions = {},
  ): Duration {
    assertDateTime(other, "other");
    const list = [...new Set(Array.isArray(units) ? units : [units])] as DurationUnit[];
    if (list.length === 0) throw invalidArg("diff needs at least one unit.");
    list.forEach((u) => assertUnit(u));
    list.sort((a, b) => UNIT_ORDER.indexOf(a) - UNIT_ORDER.indexOf(b));

    const sign = Math.sign(this.#ms - other.#ms);
    if (sign === 0) return Duration.from({});
    const otherHere = new DateTime(other.#ms, this.#zone, this.#locale);
    const [lo, hi] = sign > 0 ? [otherHere, this] : [this, otherHere];

    // Every step is measured from `lo` with the units found so far applied in one go, so that
    // lo.add(result) reproduces `hi` (calendar units first, as in add()).
    const out: Record<string, number> = {};
    const calendar: Record<string, number> = {};
    let elapsedMs = 0;
    const cursorMs = () => lo.add(calendar as DurationLike).#ms + elapsedMs;
    list.forEach((unit, i) => {
      const isLast = i === list.length - 1;
      if (unit in ELAPSED_MS) {
        const size = ELAPSED_MS[unit as keyof typeof ELAPSED_MS];
        const raw = (hi.#ms - cursorMs()) / size;
        const n = isLast && options.fractional ? raw : Math.trunc(raw);
        out[`${unit}s`] = sign * n;
        elapsedMs += n * size;
        return;
      }
      const key = `${unit}s`;
      const c = lo.add(calendar as DurationLike).#f;
      const h = hi.#f;
      const dayNo = (f: LocalFields) => daysFromCivil(f.year, f.month, f.day);
      let n: number;
      if (unit === "year") n = h.year - c.year;
      else if (unit === "month") n = (h.year - c.year) * 12 + (h.month - c.month);
      else if (unit === "week") n = Math.trunc((dayNo(h) - dayNo(c)) / 7);
      else n = dayNo(h) - dayNo(c);
      n = Math.max(0, n);
      const at = (k: number) => lo.add({ ...calendar, [key]: k } as DurationLike).#ms;
      while (n > 0 && at(n) > hi.#ms) n--;
      while (at(n + 1) <= hi.#ms) n++;
      calendar[key] = n;
      out[key] = sign * n;
    });
    return Duration.from(out as DurationLike);
  }

  /**
   * Exact elapsed time `this − other` in one *elapsed* unit, as a (fractional) number.
   * Calendar units are rejected because they have no fixed length; use {@link DateTime.diff}
   * or {@link DateTime.calendarDiff}.
   */
  elapsed(other: DateTime, unit: "hour" | "minute" | "second" | "millisecond"): number {
    assertDateTime(other, "other");
    if (!(unit in ELAPSED_MS)) {
      throw invalidArg(
        `elapsed() only supports hour, minute, second and millisecond. For "${String(unit)}" use diff() (whole calendar units) or calendarDiff() (boundaries crossed).`,
      );
    }
    return (this.#ms - other.#ms) / ELAPSED_MS[unit];
  }

  /**
   * Number of calendar **boundaries** crossed going from `other` to `this`, in this zone:
   * the difference between the calendar periods the two instants fall in. 23:59 Jan 31 → 00:01
   * Feb 1 is `1` month even though only two minutes passed. Negative when `this` is earlier.
   */
  calendarDiff(
    other: DateTime,
    unit: "year" | "quarter" | "month" | "week" | "day",
    options: WeekOptions = {},
  ): number {
    assertDateTime(other, "other");
    const idx = (dt: DateTime): number => {
      const f = dt.#f;
      switch (unit) {
        case "year":
          return f.year;
        case "quarter":
          return f.year * 4 + Math.floor((f.month - 1) / 3);
        case "month":
          return f.year * 12 + f.month - 1;
        case "day":
          return daysFromCivil(f.year, f.month, f.day);
        case "week": {
          const ws = assertWeekStart(options.weekStart ?? 1);
          return Math.floor((daysFromCivil(f.year, f.month, f.day) + 3 - (ws - 1)) / 7);
        }
        default:
          throw invalidArg(
            `calendarDiff supports year, quarter, month, week and day; received "${String(unit)}".`,
          );
      }
    };
    return idx(this) - idx(new DateTime(other.#ms, this.#zone, undefined));
  }
}
