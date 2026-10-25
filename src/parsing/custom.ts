import { ChronexaError } from "../core/result.js";
import { Zone } from "../timezone/zone.js";
import { isoWeekday } from "../utils/calendar.js";
import { localeNames, PARSE_TOKENS, tokenize, type FormatToken } from "./tokens.js";

/** Raw values pulled out of text by a format. Unset fields are `undefined`. @internal */
export interface ParsedCustom {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
  weekday?: number;
  offsetMs?: number;
  zone?: Zone;
  epochMs?: number;
}

interface Compiled {
  regex: RegExp;
  setters: ((out: ParsedCustom, value: string, state: State) => void)[];
  hasHour12: boolean;
  hasPeriod: boolean;
}

interface State {
  hour12?: number;
  period?: "am" | "pm";
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const alt = (names: readonly string[]) =>
  `(${[...names]
    .sort((a, b) => b.length - a.length)
    .map(escapeRe)
    .join("|")})`;

const compiledCache = new Map<string, Compiled>();

function compile(format: string, locale: string | undefined): Compiled {
  const key = `${locale ?? ""}\u0000${format}`;
  const hit = compiledCache.get(key);
  if (hit) return hit;

  const names = localeNames(locale);
  const setters: Compiled["setters"] = [];
  let source = "^";
  const fieldTokens: FormatToken[] = [];

  for (const t of tokenize(format)) {
    if (t.type === "literal") {
      source += escapeRe(t.value);
      continue;
    }
    const tok = t.token;
    if (!PARSE_TOKENS.has(tok)) {
      throw new ChronexaError(
        "UNSUPPORTED",
        `Token "${tok}" can be used to format but not to parse. Parseable tokens: ${[...PARSE_TOKENS].join(" ")}.`,
      );
    }
    fieldTokens.push(tok);
    const num = (re: string, set: (o: ParsedCustom, n: number, s: State) => void) => {
      source += `(${re})`;
      setters.push((o, v, s) => set(o, Number(v), s));
    };
    switch (tok) {
      case "yyyy":
        num("\\d{4}", (o, n) => (o.year = n));
        break;
      case "yy":
        num("\\d{2}", (o, n) => (o.year = n < 70 ? 2000 + n : 1900 + n));
        break;
      case "MM":
        num("\\d{2}", (o, n) => (o.month = n));
        break;
      case "M":
        num("\\d{1,2}", (o, n) => (o.month = n));
        break;
      case "dd":
        num("\\d{2}", (o, n) => (o.day = n));
        break;
      case "d":
        num("\\d{1,2}", (o, n) => (o.day = n));
        break;
      case "HH":
        num("\\d{2}", (o, n) => (o.hour = n));
        break;
      case "H":
        num("\\d{1,2}", (o, n) => (o.hour = n));
        break;
      case "hh":
        num("\\d{2}", (_o, n, s) => (s.hour12 = n));
        break;
      case "h":
        num("\\d{1,2}", (_o, n, s) => (s.hour12 = n));
        break;
      case "mm":
        num("\\d{2}", (o, n) => (o.minute = n));
        break;
      case "m":
        num("\\d{1,2}", (o, n) => (o.minute = n));
        break;
      case "ss":
        num("\\d{2}", (o, n) => (o.second = n));
        break;
      case "s":
        num("\\d{1,2}", (o, n) => (o.second = n));
        break;
      case "SSS":
        num("\\d{3}", (o, n) => (o.millisecond = n));
        break;
      case "x":
        num("-?\\d+", (o, n) => (o.epochMs = n));
        break;
      case "X":
        num("-?\\d+", (o, n) => (o.epochMs = n * 1000));
        break;
      case "MMMM":
      case "MMM": {
        const list = tok === "MMMM" ? names.months : names.monthsShort;
        source += alt(list);
        setters.push(
          (o, v) => (o.month = list.findIndex((n) => n.toLowerCase() === v.toLowerCase()) + 1),
        );
        break;
      }
      case "EEEE":
      case "EEE": {
        const list = tok === "EEEE" ? names.weekdays : names.weekdaysShort;
        source += alt(list);
        setters.push(
          (o, v) => (o.weekday = list.findIndex((n) => n.toLowerCase() === v.toLowerCase()) + 1),
        );
        break;
      }
      case "a":
        source += alt([names.am, names.pm]);
        setters.push(
          (_o, v, s) => (s.period = v.toLowerCase() === names.am.toLowerCase() ? "am" : "pm"),
        );
        break;
      case "Z":
      case "ZZ": {
        // Seconds in an offset only occur for pre-1900 local mean time, but `format()` can emit them.
        const re = tok === "Z" ? "Z|[+-]\\d{4}(?:\\d{2})?" : "Z|[+-]\\d{2}:\\d{2}(?::\\d{2})?";
        source += `(${re})`;
        setters.push((o, v) => {
          if (v === "Z") {
            o.offsetMs = 0;
            return;
          }
          const d = v.slice(1).replace(/:/g, "");
          const secs =
            (Number(d.slice(0, 2)) * 60 + Number(d.slice(2, 4))) * 60 + Number(d.slice(4, 6) || 0);
          if (
            Number(d.slice(0, 2)) > 23 ||
            Number(d.slice(2, 4)) > 59 ||
            Number(d.slice(4, 6) || 0) > 59
          ) {
            throw new ChronexaError("INVALID_DATE", `UTC offset "${v}" is out of range.`);
          }
          o.offsetMs = (v[0] === "-" ? -secs : secs) * 1000;
        });
        break;
      }
      case "VV":
        source += "([A-Za-z][A-Za-z0-9_+\\-]*(?:/[A-Za-z0-9_+\\-]+)*)";
        setters.push((o, v) => (o.zone = Zone.iana(v)));
        break;
      default:
        throw new ChronexaError("UNSUPPORTED", `Token "${tok}" cannot be parsed.`);
    }
  }
  source += "$";

  const has = (...ts: string[]) => fieldTokens.some((x) => ts.includes(x));
  const hasHour12 = has("hh", "h");
  const hasPeriod = has("a");
  if (hasHour12 !== hasPeriod) {
    throw new ChronexaError(
      "INVALID_ARGUMENT",
      `Format ${JSON.stringify(format)}: the 12-hour tokens "h"/"hh" and the am/pm token "a" must be used together.`,
    );
  }
  if (hasHour12 && has("H", "HH")) {
    throw new ChronexaError(
      "INVALID_ARGUMENT",
      `Format ${JSON.stringify(format)} mixes 12-hour and 24-hour tokens.`,
    );
  }
  if (has("x", "X") && fieldTokens.length > 1) {
    throw new ChronexaError(
      "INVALID_ARGUMENT",
      `Format ${JSON.stringify(format)}: "x"/"X" (epoch) cannot be combined with other tokens.`,
    );
  }
  if (has("Z", "ZZ") && has("VV")) {
    throw new ChronexaError(
      "INVALID_ARGUMENT",
      `Format ${JSON.stringify(format)} contains both a UTC offset and a zone identifier; use only one.`,
    );
  }

  const compiled: Compiled = { regex: new RegExp(source, "iu"), setters, hasHour12, hasPeriod };
  if (compiledCache.size > 200) compiledCache.clear();
  compiledCache.set(key, compiled);
  return compiled;
}

/**
 * Matches the whole of `text` against `format`. Throws `PARSE_ERROR` when it does not match.
 * Range checking (month 13, Feb 30, …) is left to the caller so that nothing is ever rolled over.
 * @internal
 */
export function parseWithFormat(
  text: string,
  format: string,
  locale: string | undefined,
): ParsedCustom {
  if (typeof text !== "string") {
    throw new ChronexaError("PARSE_ERROR", `Expected a string to parse, received ${typeof text}.`);
  }
  const c = compile(format, locale);
  const m = c.regex.exec(text);
  if (!m) {
    throw new ChronexaError(
      "PARSE_ERROR",
      `The text ${JSON.stringify(text)} does not match the format ${JSON.stringify(format)}. ` +
        `The whole string must match exactly (matching is case-insensitive for names).`,
    );
  }
  const out: ParsedCustom = {};
  const state: State = {};
  c.setters.forEach((set, i) => set(out, m[i + 1] as string, state));

  if (c.hasHour12) {
    const h = state.hour12 as number;
    if (h < 1 || h > 12) {
      throw new ChronexaError(
        "INVALID_DATE",
        `The 12-hour clock value ${h} must be between 1 and 12.`,
      );
    }
    out.hour = (h % 12) + (state.period === "pm" ? 12 : 0);
  }
  if (
    (out.month !== undefined && out.month < 1) ||
    (out.weekday !== undefined && out.weekday < 1)
  ) {
    throw new ChronexaError(
      "PARSE_ERROR",
      `Could not interpret a month or weekday name in ${JSON.stringify(text)}.`,
    );
  }
  return out;
}

/** True when a parsed weekday name disagrees with the date it was written next to. @internal */
export function weekdayMismatch(
  year: number,
  month: number,
  day: number,
  weekday: number,
): boolean {
  return isoWeekday(year, month, day) !== weekday;
}
