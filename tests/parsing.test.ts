import { describe, expect, it } from "vitest";
import { ChronexaError, DateTime } from "../src/index.js";

const utc = { zone: "utc" } as const;
const p = (s: string, o: object = utc) => DateTime.fromISO(s, o).toISO();

describe("ISO 8601 parsing: accepted forms", () => {
  it.each([
    ["2024-03-09", "2024-03-09T00:00:00.000Z"],
    ["20240309", "2024-03-09T00:00:00.000Z"],
    ["2024-03", "2024-03-01T00:00:00.000Z"],
    ["2024", "2024-01-01T00:00:00.000Z"],
    ["2024-069", "2024-03-09T00:00:00.000Z"], // 2024 is leap: day 69 = Mar 9
    ["2023-069", "2023-03-10T00:00:00.000Z"],
    ["2024069", "2024-03-09T00:00:00.000Z"],
    ["2024-366", "2024-12-31T00:00:00.000Z"],
    ["2024-W10-6", "2024-03-09T00:00:00.000Z"],
    ["2024W106", "2024-03-09T00:00:00.000Z"],
    ["2024-W10", "2024-03-04T00:00:00.000Z"],
    ["2020-W53-7", "2021-01-03T00:00:00.000Z"],
    ["2025-W01-1", "2024-12-30T00:00:00.000Z"],
    ["2024-03-09T10", "2024-03-09T10:00:00.000Z"],
    ["2024-03-09T10:20", "2024-03-09T10:20:00.000Z"],
    ["2024-03-09T10:20:30", "2024-03-09T10:20:30.000Z"],
    ["2024-03-09T10:20:30.5", "2024-03-09T10:20:30.500Z"],
    ["2024-03-09T10:20:30,25", "2024-03-09T10:20:30.250Z"],
    ["2024-03-09T10:20:30.123456789", "2024-03-09T10:20:30.123Z"], // truncated, not rounded
    ["2024-03-09T10:20:30.9999", "2024-03-09T10:20:30.999Z"],
    ["20240309T102030", "2024-03-09T10:20:30.000Z"],
    ["20240309T1020", "2024-03-09T10:20:00.000Z"],
    ["20240309T102030.5", "2024-03-09T10:20:30.500Z"],
    ["2024-03-09T24:00:00", "2024-03-10T00:00:00.000Z"],
    ["2024-12-31T24:00", "2025-01-01T00:00:00.000Z"],
    ["2024-03-09T10:20:30Z", "2024-03-09T10:20:30.000Z"],
    ["2024-03-09T10:20:30+02:00", "2024-03-09T08:20:30.000Z"],
    ["2024-03-09T10:20:30-05:30", "2024-03-09T15:50:30.000Z"],
    ["2024-03-09T10:20:30+02", "2024-03-09T08:20:30.000Z"],
    ["20240309T102030+0200", "2024-03-09T08:20:30.000Z"],
    ["2024-03-09T10:20:30-00:00", "2024-03-09T10:20:30.000Z"],
    ["+012024-03-09", "+012024-03-09T00:00:00.000Z"],
    ["-000001-01-01", "-000001-01-01T00:00:00.000Z"],
  ])("%s", (input, expected) => {
    expect(p(input)).toBe(expected);
  });

  it("treats fractional digits consistently (never rounds up into the next second)", () => {
    expect(DateTime.fromISO("2024-03-09T10:20:59.9996Z").second).toBe(59);
    expect(DateTime.fromISO("2024-03-09T10:20:30.0001Z").millisecond).toBe(0);
  });
});

describe("ISO 8601 parsing: rejected input", () => {
  it.each([
    ["2024-02-30", /day 30 does not exist in 2024-02/],
    ["2023-02-29", /day 29 does not exist/],
    ["2024-04-31", /does not exist/],
    ["2024-13-01", /month 13/],
    ["2024-00-10", /month 0/],
    ["2024-01-00", /day 00/],
    ["2024-367", /ordinal day 367/],
    ["2023-366", /ordinal day 366/],
    ["2024-000", /ordinal day 0/],
    ["2024-W54-1", /week 54/],
    ["2023-W53-1", /week 53 does not exist/],
    ["2024-W10-8", /weekday 8/],
    ["2024-03-09T25:00", /hour 25/],
    ["2024-03-09T24:30", /24:00:00/],
    ["2024-03-09T24:00:01", /24:00:00/],
    ["2024-03-09T10:60", /minute 60/],
    ["2024-03-09T10:20:60", /leap seconds/],
    ["2024-03-09T10:20:61", /second 61/],
    ["2024-03-09T10:20:30+24:00", /offset/],
    ["2024-03-09T10:20:30+05:60", /offset/],
    ["2024-03-09 10:20", /not a supported ISO 8601 form/],
    ["2024-03-09t10:20", /not a supported ISO 8601 form/],
    ["2024-03-09T10:20:30z", /time portion/],
    ["2024-03-09T", /time portion/],
    ["2024-03T10:00", /complete date/],
    ["2024T10:00", /complete date/],
    ["2024-W10T10:00", /complete date/],
    ["20240309T10:20", /both use the extended/],
    ["2024-03-09T1020", /both use the extended/],
    ["2024-03-09T10:2", /time portion/],
    ["2024-03-09T10.5", /time portion/],
    ["2024-03-09T10:20.5", /time portion/],
    ["2024-03-09T10:20:", /time portion/],
    ["2024-03-09T10:20:30.", /time portion/],
    ["24-03-09", /not a supported ISO 8601 form/],
    ["2024/03/09", /not a supported ISO 8601 form/],
    ["202403", /not a supported ISO 8601 form/],
    ["March 9, 2024", /not a supported ISO 8601 form/],
    ["", /not a supported ISO 8601 form/],
    [" 2024-03-09", /not a supported ISO 8601 form/],
    ["2024-03-09 ", /not a supported ISO 8601 form/],
    ["-000000-01-01", /-000000/],
    ["not a date", /not a supported ISO 8601 form/],
  ])("%j", (input, message) => {
    expect(() => DateTime.fromISO(input, utc)).toThrow(message);
    const r = DateTime.tryFromISO(input, utc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(ChronexaError);
  });

  it("rejects non-strings", () => {
    expect(() => DateTime.fromISO(20240309 as never)).toThrow(/Expected an ISO 8601 string/);
    expect(() => DateTime.fromISO(null as never)).toThrow(ChronexaError);
  });

  it("never rolls over: Feb 30 is not March 1 or 2", () => {
    const r = DateTime.tryFromISO("2024-02-30T00:00:00Z");
    expect(r.ok).toBe(false);
  });

  it("separates parse failures from calendar failures by error code", () => {
    const code = (s: string) =>
      DateTime.tryFromISO(s).ok
        ? "ok"
        : (DateTime.tryFromISO(s) as { error: ChronexaError }).error.code;
    expect(code("not a date")).toBe("PARSE_ERROR");
    expect(code("2024-02-30")).toBe("INVALID_DATE");
  });
});

describe("local time vs absolute instant", () => {
  it("offset-less text depends on the zone; offset text does not", () => {
    const a = DateTime.fromISO("2024-06-01T12:00:00", { zone: "Asia/Tokyo" });
    const b = DateTime.fromISO("2024-06-01T12:00:00", { zone: "America/Los_Angeles" });
    expect(a.toMillis()).not.toBe(b.toMillis());
    const c = DateTime.fromISO("2024-06-01T12:00:00Z", { zone: "Asia/Tokyo" });
    const d = DateTime.fromISO("2024-06-01T12:00:00Z", { zone: "America/Los_Angeles" });
    expect(c.toMillis()).toBe(d.toMillis());
  });
});

describe("custom formats", () => {
  const f = (text: string, fmt: string, o: object = utc) =>
    DateTime.fromFormat(text, fmt, o).toISO();

  it("parses numeric tokens", () => {
    expect(f("2024-03-09", "yyyy-MM-dd")).toBe("2024-03-09T00:00:00.000Z");
    expect(f("9/3/2024", "d/M/yyyy")).toBe("2024-03-09T00:00:00.000Z");
    expect(f("09.03.24 14:05:06.789", "dd.MM.yy HH:mm:ss.SSS")).toBe("2024-03-09T14:05:06.789Z");
    expect(f("2024-03-09T14:05", "yyyy-MM-dd[T]HH:mm")).toBe("2024-03-09T14:05:00.000Z");
  });

  it("pivots two-digit years: 00–69 → 2000s, 70–99 → 1900s", () => {
    expect(DateTime.fromFormat("69-01-01", "yy-MM-dd", utc).year).toBe(2069);
    expect(DateTime.fromFormat("70-01-01", "yy-MM-dd", utc).year).toBe(1970);
  });

  it("parses month and weekday names in English and other locales", () => {
    expect(f("March 9, 2024", "MMMM d, yyyy")).toBe("2024-03-09T00:00:00.000Z");
    expect(f("mar 9 2024", "MMM d yyyy")).toBe("2024-03-09T00:00:00.000Z");
    expect(f("Saturday, March 9, 2024", "EEEE, MMMM d, yyyy")).toBe("2024-03-09T00:00:00.000Z");
    expect(f("9 mars 2024", "d MMMM yyyy", { zone: "utc", locale: "fr" })).toBe(
      "2024-03-09T00:00:00.000Z",
    );
    expect(f("9. März 2024", "d. MMMM yyyy", { zone: "utc", locale: "de" })).toBe(
      "2024-03-09T00:00:00.000Z",
    );
  });

  it("rejects a weekday that disagrees with the date", () => {
    expect(() => f("Sunday, March 9, 2024", "EEEE, MMMM d, yyyy")).toThrow(/weekday/);
  });

  it("handles 12-hour clocks", () => {
    expect(f("12:00 AM", "hh:mm a", { zone: "utc", defaults: { year: 2024 } })).toBe(
      "2024-01-01T00:00:00.000Z",
    );
    expect(f("12:30 PM", "hh:mm a", { zone: "utc", defaults: { year: 2024 } })).toBe(
      "2024-01-01T12:30:00.000Z",
    );
    expect(f("1:05 pm", "h:mm a", { zone: "utc", defaults: { year: 2024 } })).toBe(
      "2024-01-01T13:05:00.000Z",
    );
    expect(() => f("13:00 PM", "hh:mm a", { zone: "utc", defaults: { year: 2024 } })).toThrow(
      /between 1 and 12/,
    );
    expect(() => DateTime.fromFormat("1 PM", "h", utc)).toThrow(/used together/);
    expect(() => DateTime.fromFormat("1 PM", "H a", utc)).toThrow(/used together/);
  });

  it("parses offsets and zone identifiers as absolute instants", () => {
    expect(f("2024-03-09 10:00 +0200", "yyyy-MM-dd HH:mm Z")).toBe("2024-03-09T08:00:00.000Z");
    expect(f("2024-03-09 10:00 +02:00", "yyyy-MM-dd HH:mm ZZ")).toBe("2024-03-09T08:00:00.000Z");
    expect(f("2024-03-09 10:00 Z", "yyyy-MM-dd HH:mm ZZ")).toBe("2024-03-09T10:00:00.000Z");
    expect(f("2024-07-01 10:00 America/New_York", "yyyy-MM-dd HH:mm VV")).toBe(
      "2024-07-01T14:00:00.000Z",
    );
    const kept = DateTime.fromFormat("2024-03-09 10:00 +0200", "yyyy-MM-dd HH:mm Z", {
      setZone: true,
    });
    expect(kept.zone.kind).toBe("fixed");
    expect(kept.hour).toBe(10);
  });

  it("parses epoch tokens", () => {
    expect(f("1709986800", "X")).toBe("2024-03-09T12:20:00.000Z");
    expect(f("1709986800123", "x")).toBe("2024-03-09T12:20:00.123Z");
  });

  it("requires a year (or a default) and validates the calendar", () => {
    expect(() => DateTime.fromFormat("03-09", "MM-dd", utc)).toThrow(/does not capture a year/);
    expect(
      DateTime.fromFormat("03-09", "MM-dd", { zone: "utc", defaults: { year: 2024 } }).year,
    ).toBe(2024);
    expect(() => f("2024-02-30", "yyyy-MM-dd")).toThrow(/does not exist/);
    expect(() => f("2024-13-01", "yyyy-MM-dd")).toThrow(/month/);
    expect(() => f("2024-01-01 24:00", "yyyy-MM-dd HH:mm")).toThrow(/hour/);
  });

  it("requires the whole string to match", () => {
    expect(() => f("2024-03-09 extra", "yyyy-MM-dd")).toThrow(/does not match the format/);
    expect(() => f(" 2024-03-09", "yyyy-MM-dd")).toThrow(/does not match/);
    expect(() => f("2024-3-9", "yyyy-MM-dd")).toThrow(/does not match/);
    expect(DateTime.tryFromFormat("nope", "yyyy-MM-dd", utc).ok).toBe(false);
  });

  it("rejects unsupported or conflicting formats", () => {
    expect(() => f("x", "yyyy qq")).toThrow(/Unknown format token/);
    expect(() => f("2024-W10", "yyyy-[W]WW")).toThrow(/can be used to format but not to parse/);
    expect(() => f("1 2", "X x")).toThrow(/cannot be combined/);
    expect(() => f("2024 +0100 UTC", "yyyy Z VV")).toThrow(/both a UTC offset and a zone/);
    expect(() => f("x", "")).toThrow(/non-empty/);
  });
});
