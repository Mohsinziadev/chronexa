import type { DateTime } from "../core/datetime.js";
import { ChronexaError } from "../core/result.js";
import type { DurationUnit } from "../core/duration.js";
import { checkLocale } from "../utils/validate.js";

export interface RelativeOptions {
  /** Reference instant. Defaults to `DateTime.now()` (honouring `Settings.now`). */
  base?: DateTime | undefined;
  locale?: string | undefined;
  /** `Intl.RelativeTimeFormat` style. Default `"long"`. */
  style?: "long" | "short" | "narrow" | undefined;
  /** `"auto"` yields phrases such as "yesterday"/"now". Default `"always"` for `toRelative`. */
  numeric?: "always" | "auto" | undefined;
  /** Force one unit instead of picking the largest non-zero one. Values are truncated. */
  unit?: Exclude<DurationUnit, "millisecond"> | undefined;
}

export type RelativeCalendarUnit = "year" | "quarter" | "month" | "week" | "day";

const cache = new Map<string, Intl.RelativeTimeFormat>();

function rtf(locale: string | undefined, style: string, numeric: string): Intl.RelativeTimeFormat {
  const key = `${locale ?? ""}|${style}|${numeric}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.RelativeTimeFormat(locale, {
      style: style as Intl.RelativeTimeFormatStyle,
      numeric: numeric as Intl.RelativeTimeFormatNumeric,
    });
    cache.set(key, f);
  }
  return f;
}

const ORDER = ["year", "month", "week", "day", "hour", "minute", "second"] as const;

/**
 * "3 hours ago" / "in 2 days". Picks the largest whole unit between `dt` and `base`
 * (truncating: 59 minutes 59 seconds is "59 minutes ago"). Units are measured with
 * `DateTime.diff`, so months and days follow the calendar of `dt`'s zone.
 * @internal
 */
export function toRelative(
  dt: DateTime,
  base: DateTime,
  locale: string | undefined,
  o: RelativeOptions,
): string {
  const loc = checkLocale(o.locale) ?? locale;
  const f = rtf(loc, o.style ?? "long", o.numeric ?? "always");
  if (o.unit !== undefined && !ORDER.includes(o.unit)) {
    throw new ChronexaError(
      "INVALID_ARGUMENT",
      `Relative unit must be one of ${ORDER.join(", ")}; received "${String(o.unit)}".`,
    );
  }
  const d = dt.diff(base, o.unit ? [o.unit] : ORDER);
  if (o.unit) return f.format(d.get(o.unit), o.unit);
  for (const u of ORDER) {
    const n = d.get(u);
    if (n !== 0) return f.format(n, u);
  }
  // Under one second: keep the direction ("0 seconds ago" / "in 0 seconds"; "now" with numeric: "auto").
  return f.format(dt.toMillis() < base.toMillis() ? -0 : 0, "second");
}

/**
 * Calendar-boundary phrasing: "yesterday", "tomorrow", "last month", "next year". Compares
 * calendar periods in `dt`'s zone, not elapsed time, so 23:59 yesterday is "yesterday"
 * even if it was one minute ago.
 * @internal
 */
export function toRelativeCalendar(
  dt: DateTime,
  base: DateTime,
  locale: string | undefined,
  o: Omit<RelativeOptions, "unit"> & { unit?: RelativeCalendarUnit | undefined },
): string {
  const loc = checkLocale(o.locale) ?? locale;
  const unit = o.unit ?? "day";
  const n = dt.calendarDiff(base, unit);
  return rtf(loc, o.style ?? "long", o.numeric ?? "auto").format(n, unit);
}
