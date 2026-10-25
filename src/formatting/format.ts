import type { Zone } from "../timezone/zone.js";
import { formatOffset } from "../timezone/zone.js";
import { localeNames, tokenize } from "../parsing/tokens.js";
import type { LocalFields } from "../utils/calendar.js";

/** Everything a pattern may refer to. @internal */
export interface FormatContext extends LocalFields {
  epochMs: number;
  offsetMs: number;
  zone: Zone;
  locale: string | undefined;
  weekday: number;
  ordinal: number;
  quarter: number;
  weekYear: number;
  weekNumber: number;
}

const pad = (n: number, width: number) => String(n).padStart(width, "0");

function year4(y: number): string {
  return y < 0 ? `-${pad(-y, 4)}` : pad(y, 4);
}

/** Formats using the token language documented on `FORMAT_TOKENS`. @internal */
export function formatPattern(pattern: string, c: FormatContext): string {
  let out = "";
  for (const t of tokenize(pattern)) {
    if (t.type === "literal") {
      out += t.value;
      continue;
    }
    switch (t.token) {
      case "yyyy":
        out += year4(c.year);
        break;
      case "yy":
        out += pad(Math.abs(c.year) % 100, 2);
        break;
      case "MMMM":
        out += localeNames(c.locale).months[c.month - 1];
        break;
      case "MMM":
        out += localeNames(c.locale).monthsShort[c.month - 1];
        break;
      case "MM":
        out += pad(c.month, 2);
        break;
      case "M":
        out += c.month;
        break;
      case "dd":
        out += pad(c.day, 2);
        break;
      case "d":
        out += c.day;
        break;
      case "EEEE":
        out += localeNames(c.locale).weekdays[c.weekday - 1];
        break;
      case "EEE":
        out += localeNames(c.locale).weekdaysShort[c.weekday - 1];
        break;
      case "e":
        out += c.weekday;
        break;
      case "HH":
        out += pad(c.hour, 2);
        break;
      case "H":
        out += c.hour;
        break;
      case "hh":
        out += pad(c.hour % 12 || 12, 2);
        break;
      case "h":
        out += c.hour % 12 || 12;
        break;
      case "mm":
        out += pad(c.minute, 2);
        break;
      case "m":
        out += c.minute;
        break;
      case "ss":
        out += pad(c.second, 2);
        break;
      case "s":
        out += c.second;
        break;
      case "SSS":
        out += pad(c.millisecond, 3);
        break;
      case "a": {
        const n = localeNames(c.locale);
        out += c.hour < 12 ? n.am : n.pm;
        break;
      }
      case "ZZZ":
        out += c.zone.abbreviationAt(c.epochMs, c.locale);
        break;
      case "ZZ":
        out += formatOffset(c.offsetMs, "extended");
        break;
      case "Z":
        out += formatOffset(c.offsetMs, "basic");
        break;
      case "VV":
        out += c.zone.name;
        break;
      case "Q":
        out += c.quarter;
        break;
      case "WW":
        out += pad(c.weekNumber, 2);
        break;
      case "W":
        out += c.weekNumber;
        break;
      case "RRRR":
        out += year4(c.weekYear);
        break;
      case "DDD":
        out += pad(c.ordinal, 3);
        break;
      case "D":
        out += c.ordinal;
        break;
      case "x":
        out += c.epochMs;
        break;
      case "X":
        out += Math.floor(c.epochMs / 1000);
        break;
    }
  }
  return out;
}
