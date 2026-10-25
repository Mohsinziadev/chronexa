import { ChronexaError, invalidArg } from "../core/result.js";
import { daysInMonth, type LocalFields } from "./calendar.js";

/** @internal */
export function assertFiniteNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw invalidArg(`${name} must be a finite number, received ${String(value)}.`);
  }
}

/** @internal */
export function assertInteger(value: unknown, name: string): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw invalidArg(`${name} must be an integer, received ${String(value)}.`);
  }
}

/** @internal */
export function assertIntInRange(value: unknown, name: string, min: number, max: number): number {
  assertInteger(value, name);
  if (value < min || value > max) {
    throw new ChronexaError(
      "INVALID_DATE",
      `${name} must be between ${min} and ${max}, received ${value}.`,
    );
  }
  return value;
}

/** Validates (never rolls over) a set of local wall-clock fields. @internal */
export function assertValidFields(f: LocalFields): void {
  assertIntInRange(f.year, "year", -271820, 275759);
  assertIntInRange(f.month, "month", 1, 12);
  const dim = daysInMonth(f.year, f.month);
  if (typeof f.day === "number" && Number.isInteger(f.day) && f.day > dim && f.day <= 31) {
    throw new ChronexaError(
      "INVALID_DATE",
      `day ${f.day} does not exist in ${f.year}-${String(f.month).padStart(2, "0")} (it has ${dim} days). ` +
        `Chronexa never rolls invalid dates over; use add() for calendar arithmetic that clamps to month end.`,
    );
  }
  assertIntInRange(f.day, "day", 1, dim);
  assertIntInRange(f.hour, "hour", 0, 23);
  assertIntInRange(f.minute, "minute", 0, 59);
  assertIntInRange(f.second, "second", 0, 59);
  assertIntInRange(f.millisecond, "millisecond", 0, 999);
}

const LOCALE_CACHE = new Set<string>();

/** Validates a BCP 47 tag; returns it unchanged. @internal */
export function checkLocale(locale: string | undefined): string | undefined {
  if (locale === undefined || LOCALE_CACHE.has(locale)) return locale;
  try {
    Intl.getCanonicalLocales(locale);
  } catch (e) {
    throw new ChronexaError(
      "INVALID_LOCALE",
      `"${locale}" is not a valid BCP 47 locale tag (examples: "en-US", "de", "ja-JP").`,
      { cause: e },
    );
  }
  LOCALE_CACHE.add(locale);
  return locale;
}
