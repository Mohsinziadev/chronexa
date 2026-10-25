/** Pure proleptic-Gregorian calendar arithmetic. No `Date`, no `Intl`. @internal */

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;
/** Largest magnitude of an epoch-millisecond value representable by `Date`. */
export const MAX_EPOCH_MS = 8.64e15;

export interface LocalFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] as number);
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** Days since 1970-01-01 for a civil date (Hinnant's algorithm). */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

export function dayOfYear(year: number, month: number, day: number): number {
  return daysFromCivil(year, month, day) - daysFromCivil(year, 1, 1) + 1;
}

/** ISO weekday, 1 = Monday … 7 = Sunday, from a day number since the epoch. */
export function isoWeekdayFromDays(days: number): number {
  return mod(days + 3, 7) + 1; // 1970-01-01 was a Thursday (4)
}

export function isoWeekday(year: number, month: number, day: number): number {
  return isoWeekdayFromDays(daysFromCivil(year, month, day));
}

function p(year: number): number {
  return mod(year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400), 7);
}

export function weeksInIsoYear(year: number): number {
  return p(year) === 4 || p(year - 1) === 3 ? 53 : 52;
}

export function isoWeekOf(
  year: number,
  month: number,
  day: number,
): { weekYear: number; weekNumber: number } {
  const wd = isoWeekday(year, month, day);
  const week = Math.floor((dayOfYear(year, month, day) - wd + 10) / 7);
  if (week < 1) return { weekYear: year - 1, weekNumber: weeksInIsoYear(year - 1) };
  if (week > weeksInIsoYear(year)) return { weekYear: year + 1, weekNumber: 1 };
  return { weekYear: year, weekNumber: week };
}

/** Day number (since epoch) of ISO week-date `weekYear-Www-weekday`. Caller validates ranges. */
export function daysFromIsoWeek(weekYear: number, week: number, weekday: number): number {
  const jan4 = daysFromCivil(weekYear, 1, 4);
  const mondayOfWeek1 = jan4 - (isoWeekdayFromDays(jan4) - 1);
  return mondayOfWeek1 + (week - 1) * 7 + (weekday - 1);
}

export function timeOfDayMs(f: LocalFields): number {
  return f.hour * MS_PER_HOUR + f.minute * MS_PER_MINUTE + f.second * MS_PER_SECOND + f.millisecond;
}

/** Local wall-clock fields -> "local ms" (the value as if the wall clock were UTC). */
export function localMsFromFields(f: LocalFields): number {
  return daysFromCivil(f.year, f.month, f.day) * MS_PER_DAY + timeOfDayMs(f);
}

export function fieldsFromLocalMs(localMs: number): LocalFields {
  const days = Math.floor(localMs / MS_PER_DAY);
  const rem = localMs - days * MS_PER_DAY;
  const { year, month, day } = civilFromDays(days);
  const hour = Math.floor(rem / MS_PER_HOUR);
  const minute = Math.floor((rem % MS_PER_HOUR) / MS_PER_MINUTE);
  const second = Math.floor((rem % MS_PER_MINUTE) / MS_PER_SECOND);
  return { year, month, day, hour, minute, second, millisecond: rem % MS_PER_SECOND };
}
