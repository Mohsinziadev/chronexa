import { DateTime } from "../core/datetime.js";
import { ChronexaError, invalidArg } from "../core/result.js";

function nonEmpty(dates: readonly DateTime[], fn: string): void {
  if (dates.length === 0) throw invalidArg(`${fn}() needs at least one DateTime.`);
  for (const d of dates)
    if (!(d instanceof DateTime)) throw invalidArg(`${fn}() accepts only DateTime arguments.`);
}

/** The earliest instant. Returns the first of any equal instants. */
export function min(...dates: DateTime[]): DateTime {
  nonEmpty(dates, "min");
  return dates.reduce((a, b) => (b.toMillis() < a.toMillis() ? b : a));
}

/** The latest instant. Returns the first of any equal instants. */
export function max(...dates: DateTime[]): DateTime {
  nonEmpty(dates, "max");
  return dates.reduce((a, b) => (b.toMillis() > a.toMillis() ? b : a));
}

/** Restricts `date` to `[lower, upper]` (both inclusive). Throws if `lower` is after `upper`. */
export function clamp(date: DateTime, lower: DateTime, upper: DateTime): DateTime {
  nonEmpty([date, lower, upper], "clamp");
  if (lower.toMillis() > upper.toMillis()) {
    throw new ChronexaError(
      "INVALID_ARGUMENT",
      "clamp(): the lower bound is after the upper bound.",
    );
  }
  return date.toMillis() < lower.toMillis()
    ? lower
    : date.toMillis() > upper.toMillis()
      ? upper
      : date;
}

/** Comparator for `Array.prototype.sort`, ordering by instant. */
export function compare(a: DateTime, b: DateTime): -1 | 0 | 1 {
  return a.compare(b);
}

/**
 * Calendar days from `start`'s date to `end`'s date (`end` is viewed in `start`'s zone),
 * ignoring the time of day. Signed: negative when `end` is earlier.
 *
 * - exclusive (default): Jan 1 → Jan 3 is `2`; same day is `0`.
 * - `inclusive: true` counts both end days: Jan 1 → Jan 3 is `3`; same day is `1`;
 *   Jan 3 → Jan 1 is `-3`.
 */
export function countDays(
  start: DateTime,
  end: DateTime,
  options: { inclusive?: boolean | undefined } = {},
): number {
  nonEmpty([start, end], "countDays");
  const diff = end.calendarDiff(start, "day");
  if (!options.inclusive) return diff;
  return diff >= 0 ? diff + 1 : diff - 1;
}
