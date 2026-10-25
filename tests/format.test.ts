import { describe, expect, it } from "vitest";
import { DateTime, FORMAT_TOKENS, Settings } from "../src/index.js";

const d = DateTime.fromISO("2024-03-09T14:05:06.078", { zone: "America/New_York" }); // Saturday, EST

describe("format()", () => {
  it.each([
    ["yyyy-MM-dd HH:mm:ss.SSS", "2024-03-09 14:05:06.078"],
    ["yy/M/d H:m:s", "24/3/9 14:5:6"],
    ["h:mm a", "2:05 PM"],
    ["hh:mm a", "02:05 PM"],
    ["EEEE, MMMM d", "Saturday, March 9"],
    ["EEE, MMM dd", "Sat, Mar 09"],
    ["e", "6"],
    ["Q", "1"],
    ["W / WW / RRRR", "10 / 10 / 2024"],
    ["D / DDD", "69 / 069"],
    ["Z ZZ VV", "-0500 -05:00 America/New_York"],
    ["ZZZ", "EST"],
    ["x", "1710011106078"],
    ["X", "1710011106"],
    ["[Today is] EEEE", "Today is Saturday"],
    ["[[escaped]]", "[escaped]"], // no nesting: the first ] closes the literal
  ])("%s → %s", (pattern, expected) => {
    expect(d.format(pattern, { locale: "en-US" })).toBe(expected);
  });

  it("midnight and noon on the 12-hour clock", () => {
    const m = DateTime.fromISO("2024-03-09T00:30:00", { zone: "utc" });
    expect(m.format("h a", { locale: "en-US" })).toBe("12 AM");
    expect(m.set({ hour: 12 }).format("hh a", { locale: "en-US" })).toBe("12 PM");
  });

  it("uses locale names", () => {
    expect(d.format("EEEE d MMMM yyyy", { locale: "fr" })).toBe("samedi 9 mars 2024");
    expect(d.format("EEEE d MMMM yyyy", { locale: "de" })).toBe("Samstag 9 März 2024");
    expect(d.format("EEEE", { locale: "es" })).toBe("sábado");
    expect(d.withLocale("fr").format("MMMM")).toBe("mars");
    expect(d.format("MMMM", { locale: "ja" })).toBe("3月");
  });

  it("uses Latin digits and the Gregorian calendar for names even in other locales", () => {
    expect(d.format("yyyy-MM-dd", { locale: "ar-SA" })).toBe("2024-03-09");
    expect(d.format("yyyy", { locale: "th-TH" })).toBe("2024");
  });

  it("prints negative and small years padded", () => {
    expect(DateTime.fromObject({ year: 5 }, { zone: "utc" }).format("yyyy")).toBe("0005");
    expect(DateTime.fromObject({ year: -44 }, { zone: "utc" }).format("yyyy")).toBe("-0044");
  });

  it("rejects unknown tokens and unclosed brackets", () => {
    expect(() => d.format("yyyy-MM-dd at")).toThrow(/Unknown format token "t"/);
    expect(() => d.format("yyyy-MM-dd'T'HH")).toThrow(/Wrap literal letters in square brackets/);
    expect(() => d.format("yyyy [oops")).toThrow(/Unclosed/);
    expect(() => d.format("yyy")).toThrow(/Unknown format token "yyy"/);
  });

  it("every documented token formats", () => {
    for (const token of FORMAT_TOKENS) expect(d.format(token, { locale: "en-US" })).not.toBe("");
  });
});

describe("toLocaleString()", () => {
  it("defaults to medium date + short time", () => {
    expect(d.toLocaleString(undefined, "en-US")).toMatch(/Mar 9, 2024.*2:05\sPM/);
  });

  it("follows locale and options", () => {
    expect(d.toLocaleString({ dateStyle: "full" }, "de")).toBe("Samstag, 9. März 2024");
    expect(d.withLocale("fr").toLocaleString({ month: "long", day: "numeric" })).toBe("9 mars");
    Settings.defaultLocale = "ja";
    expect(DateTime.fromMillis(0, { zone: "utc" }).toLocaleString({ dateStyle: "long" })).toBe(
      "1970年1月1日",
    );
    Settings.reset();
  });
});

describe("relative time", () => {
  const base = DateTime.fromISO("2024-06-15T12:00:00Z", { zone: "utc" });
  const rel = (delta: object, o: object = {}) =>
    base.add(delta).toRelative({ base, locale: "en", ...o });

  it.each([
    [{ seconds: -30 }, "30 seconds ago"],
    [{ seconds: -1 }, "1 second ago"],
    [{ minutes: -5 }, "5 minutes ago"],
    [{ minutes: -59, seconds: -59 }, "59 minutes ago"],
    [{ hours: -3 }, "3 hours ago"],
    [{ hours: -23 }, "23 hours ago"],
    [{ days: -1 }, "1 day ago"],
    [{ days: -2 }, "2 days ago"],
    [{ days: -14 }, "2 weeks ago"],
    [{ months: -1 }, "1 month ago"],
    [{ months: -11 }, "11 months ago"],
    [{ years: -2 }, "2 years ago"],
    [{ seconds: 30 }, "in 30 seconds"],
    [{ hours: 3 }, "in 3 hours"],
    [{ days: 2 }, "in 2 days"],
    [{ years: 1 }, "in 1 year"],
    [{ milliseconds: -400 }, "0 seconds ago"],
  ])("%j → %s", (delta, expected) => {
    expect(rel(delta)).toBe(expected);
  });

  it("supports numeric:auto, style, locale and a forced unit", () => {
    expect(rel({ milliseconds: 0 }, { numeric: "auto" })).toBe("now");
    expect(rel({ days: -1 }, { numeric: "auto" })).toBe("yesterday");
    expect(rel({ hours: -3 }, { style: "short" })).toBe("3 hr. ago");
    expect(rel({ hours: -3 }, { locale: "de" })).toBe("vor 3 Stunden");
    expect(rel({ hours: -3 }, { locale: "es" })).toBe("hace 3 horas");
    expect(rel({ hours: -48 }, { unit: "hour" })).toBe("48 hours ago");
    expect(rel({ days: -45 }, { unit: "month" })).toBe("1 month ago");
  });

  it("uses the injectable clock when no base is given", () => {
    Settings.now = () => base.toMillis();
    expect(base.subtract({ hours: 2 }).toRelative({ locale: "en" })).toBe("2 hours ago");
    Settings.reset();
  });

  it("toRelativeCalendar compares calendar periods", () => {
    const ny = "America/New_York";
    const now = DateTime.fromISO("2024-06-15T00:30:00", { zone: ny });
    const yesterday = DateTime.fromISO("2024-06-14T23:50:00", { zone: ny }); // 40 minutes earlier
    expect(yesterday.toRelativeCalendar({ base: now, locale: "en" })).toBe("yesterday");
    expect(yesterday.toRelative({ base: now, locale: "en" })).toBe("40 minutes ago");
    expect(now.add({ days: 1 }).toRelativeCalendar({ base: now, locale: "en" })).toBe("tomorrow");
    expect(now.toRelativeCalendar({ base: now, locale: "en" })).toBe("today");
    expect(
      now.subtract({ months: 1 }).toRelativeCalendar({ base: now, locale: "en", unit: "month" }),
    ).toBe("last month");
    expect(
      now.add({ years: 1 }).toRelativeCalendar({ base: now, locale: "en", unit: "year" }),
    ).toBe("next year");
    expect(now.add({ days: 1 }).toRelativeCalendar({ base: now, locale: "de" })).toBe("morgen");
  });

  it("validates arguments", () => {
    expect(() => base.toRelative({ unit: "decade" as never, base })).toThrow(/Relative unit/);
    expect(() => base.toRelative({ locale: "!!", base })).toThrow(/BCP 47/);
  });
});
