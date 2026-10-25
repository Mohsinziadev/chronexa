import { ChronexaError } from "../core/result.js";
import {
  civilFromDays,
  daysFromCivil,
  daysFromIsoWeek,
  daysInMonth,
  daysInYear,
  weeksInIsoYear,
  type LocalFields,
} from "../utils/calendar.js";

/** Result of a successful ISO 8601 parse. @internal */
export interface ParsedISO {
  readonly fields: LocalFields;
  /** Offset in ms if the text carried one (`Z` → 0), otherwise `null`: a local wall time. */
  readonly offsetMs: number | null;
  /** True when the text used the `Z` designator. */
  readonly isZ: boolean;
}

const Y = "([+-]\\d{6}|\\d{4})";
const DATE_FORMS: {
  re: RegExp;
  kind: "cal" | "ym" | "y" | "ord" | "wk" | "wkonly";
  basic: boolean;
}[] = [
  { re: new RegExp(`^${Y}-(\\d{2})-(\\d{2})$`), kind: "cal", basic: false },
  { re: new RegExp(`^${Y}(\\d{2})(\\d{2})$`), kind: "cal", basic: true },
  { re: new RegExp(`^${Y}-(\\d{2})$`), kind: "ym", basic: false },
  { re: new RegExp(`^${Y}$`), kind: "y", basic: false },
  { re: new RegExp(`^${Y}-(\\d{3})$`), kind: "ord", basic: false },
  { re: new RegExp(`^${Y}(\\d{3})$`), kind: "ord", basic: true },
  { re: new RegExp(`^${Y}-W(\\d{2})-(\\d)$`), kind: "wk", basic: false },
  { re: new RegExp(`^${Y}W(\\d{2})(\\d)$`), kind: "wk", basic: true },
  { re: new RegExp(`^${Y}-W(\\d{2})$`), kind: "wkonly", basic: false },
  { re: new RegExp(`^${Y}W(\\d{2})$`), kind: "wkonly", basic: true },
];

const OFF_EXT = "Z|[+-]\\d{2}(?::\\d{2}(?::\\d{2})?)?";
const OFF_BASIC = "Z|[+-]\\d{2}(?:\\d{2}(?:\\d{2})?)?";
const TIME_EXT = new RegExp(`^(\\d{2})(?::(\\d{2})(?::(\\d{2})(?:[.,](\\d+))?)?)?(${OFF_EXT})?$`);
const TIME_BASIC = new RegExp(`^(\\d{2})(?:(\\d{2})(?:(\\d{2})(?:[.,](\\d+))?)?)?(${OFF_BASIC})?$`);

function fail(text: string, reason: string, code: "PARSE_ERROR" | "INVALID_DATE" = "PARSE_ERROR") {
  return new ChronexaError(
    code,
    `Cannot parse ${JSON.stringify(text)} as an ISO 8601 date/time: ${reason}`,
  );
}

function parseYear(text: string, raw: string): number {
  if (raw === "-000000") throw fail(text, `"-000000" is not a valid year.`);
  return Number(raw);
}

function parseOffset(text: string, raw: string): number {
  if (raw === "Z") return 0;
  const sign = raw[0] === "-" ? -1 : 1;
  const digits = raw.slice(1).replace(/:/g, "");
  const h = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2, 4) || 0);
  const s = Number(digits.slice(4, 6) || 0);
  if (h > 23 || m > 59 || s > 59)
    throw fail(text, `UTC offset "${raw}" is out of range.`, "INVALID_DATE");
  return sign * ((h * 60 + m) * 60 + s) * 1000;
}

/**
 * Strict ISO 8601 parser. Supported: calendar dates (`YYYY-MM-DD`, `YYYYMMDD`, `YYYY-MM`,
 * `YYYY`), ordinal dates (`YYYY-DDD`), week dates (`YYYY-Www-D`, `YYYY-Www`), expanded years
 * (`±YYYYYY`), times `hh[:mm[:ss[.f+]]]` (basic or extended, matching the date), `24:00`, and
 * offsets `Z`, `±hh`, `±hh:mm` (+ seconds as an extension). Fractions truncate to milliseconds.
 * Not supported: leap seconds (`:60`), fractional hours/minutes, durations/intervals in this
 * function, lower-case designators, a space instead of `T`.
 * @internal
 */
export function parseISO(text: string): ParsedISO {
  if (typeof text !== "string") {
    throw new ChronexaError("PARSE_ERROR", `Expected an ISO 8601 string, received ${typeof text}.`);
  }
  const tIndex = text.indexOf("T");
  const datePart = tIndex === -1 ? text : text.slice(0, tIndex);
  const timePart = tIndex === -1 ? null : text.slice(tIndex + 1);

  let year = 0,
    month = 1,
    day = 1;
  let dateBasic = false;
  let complete = false;
  let matched = false;
  for (const form of DATE_FORMS) {
    const m = form.re.exec(datePart);
    if (!m) continue;
    matched = true;
    dateBasic = form.basic;
    year = parseYear(text, m[1] as string);
    const a = Number(m[2]);
    const b = Number(m[3]);
    switch (form.kind) {
      case "cal":
        month = a;
        day = b;
        complete = true;
        if (month < 1 || month > 12)
          throw fail(text, `month ${month} is not between 01 and 12.`, "INVALID_DATE");
        if (day < 1 || day > daysInMonth(year, month)) {
          throw fail(
            text,
            `day ${String(day).padStart(2, "0")} does not exist in ${String(m[1])}-${String(month).padStart(2, "0")}; invalid dates are never rolled over.`,
            "INVALID_DATE",
          );
        }
        break;
      case "ym":
        month = a;
        if (month < 1 || month > 12)
          throw fail(text, `month ${month} is not between 01 and 12.`, "INVALID_DATE");
        break;
      case "y":
        break;
      case "ord": {
        if (a < 1 || a > daysInYear(year)) {
          throw fail(text, `ordinal day ${a} is not valid for year ${year}.`, "INVALID_DATE");
        }
        ({ month, day } = civilFromDays(daysFromCivil(year, 1, 1) + a - 1));
        complete = true;
        break;
      }
      case "wk":
      case "wkonly": {
        const wd = form.kind === "wk" ? b : 1;
        if (a < 1 || a > weeksInIsoYear(year)) {
          throw fail(text, `week ${a} does not exist in ISO week-year ${year}.`, "INVALID_DATE");
        }
        if (wd < 1 || wd > 7)
          throw fail(text, `weekday ${wd} is not between 1 and 7.`, "INVALID_DATE");
        const c = civilFromDays(daysFromIsoWeek(year, a, wd));
        year = c.year;
        month = c.month;
        day = c.day;
        complete = form.kind === "wk";
        break;
      }
    }
    break;
  }
  if (!matched) {
    throw fail(
      text,
      `the date portion is not a supported ISO 8601 form (use YYYY-MM-DD, YYYYMMDD, YYYY-DDD, YYYY-Www-D, YYYY-MM or YYYY).`,
    );
  }

  let hour = 0,
    minute = 0,
    second = 0,
    millisecond = 0;
  let offsetMs: number | null = null;
  let isZ = false;

  if (timePart !== null) {
    if (!complete)
      throw fail(text, "a time can only follow a complete date (year, month and day).");
    const extended = timePart.includes(":");
    const m = (extended ? TIME_EXT : TIME_BASIC).exec(timePart);
    if (!m) {
      throw fail(
        text,
        `the time portion "${timePart}" is not valid. Expected hh, hh:mm or hh:mm:ss[.fff] optionally followed by Z or ±hh:mm.`,
      );
    }
    const bareHours = m[2] === undefined;
    if (!bareHours && extended === dateBasic) {
      throw fail(
        text,
        "the date and time must both use the extended (with separators) or both the basic format.",
      );
    }
    hour = Number(m[1]);
    minute = m[2] === undefined ? 0 : Number(m[2]);
    second = m[3] === undefined ? 0 : Number(m[3]);
    if (m[4] !== undefined) millisecond = Number(m[4].slice(0, 3).padEnd(3, "0"));
    if (m[5] !== undefined) {
      isZ = m[5] === "Z";
      offsetMs = parseOffset(text, m[5]);
    }
    if (minute > 59) throw fail(text, `minute ${minute} is out of range.`, "INVALID_DATE");
    if (second === 60) throw fail(text, "leap seconds (:60) are not supported.", "INVALID_DATE");
    if (second > 59) throw fail(text, `second ${second} is out of range.`, "INVALID_DATE");
    if (hour === 24) {
      if (minute !== 0 || second !== 0 || millisecond !== 0) {
        throw fail(text, "hour 24 is only valid as exactly 24:00:00 (end of day).", "INVALID_DATE");
      }
      const next = civilFromDays(daysFromCivil(year, month, day) + 1);
      year = next.year;
      month = next.month;
      day = next.day;
      hour = 0;
    } else if (hour > 23) {
      throw fail(text, `hour ${hour} is out of range.`, "INVALID_DATE");
    }
  }

  return { fields: { year, month, day, hour, minute, second, millisecond }, offsetMs, isZ };
}
