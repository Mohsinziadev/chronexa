import { ChronexaError } from "../core/result.js";

/**
 * Tokens understood by `format()` and `fromFormat()`.
 *
 * Letters are always tokens; wrap literal text in square brackets: `"yyyy-MM-dd [at] HH:mm"`.
 * `fromFormat` supports a documented subset (see docs/parsing.md).
 */
export const FORMAT_TOKENS = [
  "yyyy",
  "yy",
  "MMMM",
  "MMM",
  "MM",
  "M",
  "dd",
  "d",
  "EEEE",
  "EEE",
  "e",
  "HH",
  "H",
  "hh",
  "h",
  "mm",
  "m",
  "ss",
  "s",
  "SSS",
  "a",
  "ZZZ",
  "ZZ",
  "Z",
  "VV",
  "Q",
  "WW",
  "W",
  "RRRR",
  "DDD",
  "D",
  "x",
  "X",
] as const;

export type FormatToken = (typeof FORMAT_TOKENS)[number];

const TOKEN_SET: ReadonlySet<string> = new Set(FORMAT_TOKENS);

/** Tokens accepted when parsing text with `fromFormat`. @internal */
export const PARSE_TOKENS: ReadonlySet<string> = new Set([
  "yyyy",
  "yy",
  "MMMM",
  "MMM",
  "MM",
  "M",
  "dd",
  "d",
  "EEEE",
  "EEE",
  "HH",
  "H",
  "hh",
  "h",
  "mm",
  "m",
  "ss",
  "s",
  "SSS",
  "a",
  "ZZ",
  "Z",
  "VV",
  "x",
  "X",
]);

export type Token =
  | { readonly type: "literal"; readonly value: string }
  | { readonly type: "field"; readonly token: FormatToken };

const cache = new Map<string, readonly Token[]>();

/** Splits a pattern into literal and field tokens; throws on unknown letters. @internal */
export function tokenize(pattern: string): readonly Token[] {
  const hit = cache.get(pattern);
  if (hit) return hit;
  if (typeof pattern !== "string" || pattern === "") {
    throw new ChronexaError("INVALID_ARGUMENT", "A format pattern must be a non-empty string.");
  }
  const out: Token[] = [];
  let literal = "";
  const flush = () => {
    if (literal) out.push({ type: "literal", value: literal });
    literal = "";
  };
  for (let i = 0; i < pattern.length;) {
    const ch = pattern[i] as string;
    if (ch === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end === -1) {
        throw new ChronexaError(
          "INVALID_ARGUMENT",
          `Unclosed "[" in format pattern ${JSON.stringify(pattern)}.`,
        );
      }
      literal += pattern.slice(i + 1, end);
      i = end + 1;
    } else if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (pattern[j] === ch) j++;
      const run = pattern.slice(i, j);
      if (!TOKEN_SET.has(run)) {
        throw new ChronexaError(
          "INVALID_ARGUMENT",
          `Unknown format token "${run}" in ${JSON.stringify(pattern)}. ` +
            `Wrap literal letters in square brackets, e.g. "[${run}]". Supported tokens: ${FORMAT_TOKENS.join(" ")}.`,
        );
      }
      flush();
      out.push({ type: "field", token: run as FormatToken });
      i = j;
    } else {
      literal += ch;
      i++;
    }
  }
  flush();
  if (cache.size > 500) cache.clear();
  cache.set(pattern, out);
  return out;
}

export interface LocaleNames {
  months: readonly string[];
  monthsShort: readonly string[];
  /** Index 0 = Monday … 6 = Sunday. */
  weekdays: readonly string[];
  weekdaysShort: readonly string[];
  am: string;
  pm: string;
}

const namesCache = new Map<string, LocaleNames>();

/** Month/weekday/day-period names from `Intl` for a locale (Gregorian, standalone forms). @internal */
export function localeNames(locale: string | undefined): LocaleNames {
  const key = locale ?? "";
  const hit = namesCache.get(key);
  if (hit) return hit;
  const base = { calendar: "gregory", numberingSystem: "latn", timeZone: "UTC" } as const;
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...base, ...o });
  const month = (style: "long" | "short") => {
    const fmt = f({ month: style });
    return Array.from({ length: 12 }, (_, i) => fmt.format(Date.UTC(2021, i, 15)));
  };
  const weekday = (style: "long" | "short") => {
    const fmt = f({ weekday: style });
    return Array.from({ length: 7 }, (_, i) => fmt.format(Date.UTC(2021, 0, 4 + i))); // Jan 4 2021 = Monday
  };
  const period = (hour: number) => {
    const parts = f({ hour: "numeric", hour12: true }).formatToParts(Date.UTC(2021, 0, 1, hour));
    return parts.find((p) => p.type === "dayPeriod")?.value ?? (hour < 12 ? "AM" : "PM");
  };
  const names: LocaleNames = {
    months: month("long"),
    monthsShort: month("short"),
    weekdays: weekday("long"),
    weekdaysShort: weekday("short"),
    am: period(1),
    pm: period(13),
  };
  namesCache.set(key, names);
  return names;
}
