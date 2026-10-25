import { describe, expect, it } from "vitest";
import { ChronexaError, DateTime, RecurrenceRule, type RecurrenceOptions } from "../src/index.js";

const NY = "America/New_York";
const at = (s: string, zone = NY) => DateTime.fromISO(s, { zone });
const days = (r: RecurrenceRule, limit = 50) => r.all({ limit }).map((x) => x.toISODate());
const rule = (
  o: Partial<RecurrenceOptions> & Pick<RecurrenceOptions, "freq">,
  start = "2024-01-01T09:00:00",
) => new RecurrenceRule({ start: at(start), ...o });

describe("daily", () => {
  it("repeats every n days and honours count", () => {
    expect(days(rule({ freq: "daily", count: 3 }))).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
    expect(days(rule({ freq: "daily", interval: 2, count: 3 }))).toEqual([
      "2024-01-01",
      "2024-01-03",
      "2024-01-05",
    ]);
    expect(days(rule({ freq: "daily", interval: 30, count: 3 }))).toEqual([
      "2024-01-01",
      "2024-01-31",
      "2024-03-01",
    ]);
  });

  it("filters by weekday", () => {
    expect(days(rule({ freq: "daily", byWeekday: [1, 3], count: 4 }))).toEqual([
      "2024-01-01",
      "2024-01-03",
      "2024-01-08",
      "2024-01-10",
    ]);
  });

  it("keeps the wall-clock time across DST", () => {
    const out = rule({ freq: "daily", count: 3 }, "2025-03-08T09:00:00").all();
    expect(out.map((x) => x.toISO())).toEqual([
      "2025-03-08T09:00:00.000-05:00",
      "2025-03-09T09:00:00.000-04:00",
      "2025-03-10T09:00:00.000-04:00",
    ]);
  });

  it("resolves occurrences in a DST gap with the chosen disambiguation", () => {
    const compat = rule({ freq: "daily", count: 3 }, "2025-03-08T02:30:00").all();
    expect(compat.map((x) => x.toISO().slice(0, 29))).toEqual([
      "2025-03-08T02:30:00.000-05:00",
      "2025-03-09T03:30:00.000-04:00",
      "2025-03-10T02:30:00.000-04:00",
    ]);
    expect(() =>
      rule({ freq: "daily", count: 3, disambiguation: "reject" }, "2025-03-08T02:30:00").all(),
    ).toThrow(/does not exist/);
  });

  it("start is only an occurrence when it matches the rule", () => {
    // 2024-01-01 is a Monday; byWeekday [2] (Tuesday) starts on the 2nd
    expect(days(rule({ freq: "daily", byWeekday: [2], count: 2 }))).toEqual([
      "2024-01-02",
      "2024-01-09",
    ]);
  });
});

describe("weekly", () => {
  it("defaults to the weekday of start", () => {
    expect(days(rule({ freq: "weekly", count: 3 }))).toEqual([
      "2024-01-01",
      "2024-01-08",
      "2024-01-15",
    ]);
  });

  it("supports selected weekdays in chronological order", () => {
    expect(
      days(rule({ freq: "weekly", byWeekday: [5, 1, 3], count: 5 }, "2024-01-03T09:00:00")),
    ).toEqual(["2024-01-03", "2024-01-05", "2024-01-08", "2024-01-10", "2024-01-12"]);
  });

  it("interval 2 skips alternate weeks", () => {
    expect(days(rule({ freq: "weekly", interval: 2, count: 3 }))).toEqual([
      "2024-01-01",
      "2024-01-15",
      "2024-01-29",
    ]);
    expect(
      days(
        rule({ freq: "weekly", interval: 2, byWeekday: [1, 3], count: 3 }, "2024-01-03T09:00:00"),
      ),
    ).toEqual(["2024-01-03", "2024-01-15", "2024-01-17"]);
  });

  it("weekStart changes which days share a week when interval > 1", () => {
    // Sunday Jan 7 and Monday Jan 8, interval 2
    const mondayWeeks = days(
      rule({ freq: "weekly", interval: 2, byWeekday: [7, 1], count: 4 }, "2024-01-07T09:00:00"),
    );
    const sundayWeeks = days(
      rule(
        { freq: "weekly", interval: 2, byWeekday: [7, 1], weekStart: 7, count: 4 },
        "2024-01-07T09:00:00",
      ),
    );
    expect(mondayWeeks).toEqual(["2024-01-07", "2024-01-15", "2024-01-21", "2024-01-29"]);
    expect(sundayWeeks).toEqual(["2024-01-07", "2024-01-08", "2024-01-21", "2024-01-22"]);
  });
});

describe("monthly", () => {
  it("skips months that lack the day by default (RFC 5545)", () => {
    expect(days(rule({ freq: "monthly", count: 4 }, "2024-01-31T09:00:00"))).toEqual([
      "2024-01-31",
      "2024-03-31",
      "2024-05-31",
      "2024-07-31",
    ]);
  });

  it("can clamp instead", () => {
    expect(
      days(rule({ freq: "monthly", invalidDate: "clamp", count: 4 }, "2024-01-31T09:00:00")),
    ).toEqual(["2024-01-31", "2024-02-29", "2024-03-31", "2024-04-30"]);
  });

  it("supports several days and negative days", () => {
    expect(days(rule({ freq: "monthly", byMonthDay: [15, 1], count: 4 }))).toEqual([
      "2024-01-01",
      "2024-01-15",
      "2024-02-01",
      "2024-02-15",
    ]);
    expect(days(rule({ freq: "monthly", byMonthDay: [-1], count: 3 }))).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
    ]);
    expect(days(rule({ freq: "monthly", byMonthDay: [-2], count: 2 }))).toEqual([
      "2024-01-30",
      "2024-02-28",
    ]);
  });

  it("supports intervals", () => {
    expect(days(rule({ freq: "monthly", interval: 3, count: 4 }))).toEqual([
      "2024-01-01",
      "2024-04-01",
      "2024-07-01",
      "2024-10-01",
    ]);
    expect(days(rule({ freq: "monthly", interval: 13, count: 2 }))).toEqual([
      "2024-01-01",
      "2025-02-01",
    ]);
  });

  it("supports nth weekdays, including from the end", () => {
    expect(
      days(rule({ freq: "monthly", byNthWeekday: [{ weekday: 1, nth: 2 }], count: 3 })),
    ).toEqual(["2024-01-08", "2024-02-12", "2024-03-11"]);
    expect(
      days(rule({ freq: "monthly", byNthWeekday: [{ weekday: 5, nth: -1 }], count: 3 })),
    ).toEqual(["2024-01-26", "2024-02-23", "2024-03-29"]);
    expect(
      days(rule({ freq: "monthly", byNthWeekday: [{ weekday: 5, nth: -2 }], count: 1 })),
    ).toEqual(["2024-01-19"]);
    // a 5th Monday exists in some months only
    expect(
      days(rule({ freq: "monthly", byNthWeekday: [{ weekday: 1, nth: 5 }], count: 3 })),
    ).toEqual(["2024-01-29", "2024-04-29", "2024-07-29"]);
  });
});

describe("yearly", () => {
  it("repeats on the start's month and day; Feb 29 skips or clamps", () => {
    expect(days(rule({ freq: "yearly", count: 3 }, "2024-02-29T09:00:00"))).toEqual([
      "2024-02-29",
      "2028-02-29",
      "2032-02-29",
    ]);
    expect(
      days(rule({ freq: "yearly", invalidDate: "clamp", count: 3 }, "2024-02-29T09:00:00")),
    ).toEqual(["2024-02-29", "2025-02-28", "2026-02-28"]);
    expect(days(rule({ freq: "yearly", interval: 2, count: 3 }))).toEqual([
      "2024-01-01",
      "2026-01-01",
      "2028-01-01",
    ]);
  });

  it("supports several months, days and nth weekdays", () => {
    expect(days(rule({ freq: "yearly", byMonth: [9, 3], byMonthDay: [15], count: 3 }))).toEqual([
      "2024-03-15",
      "2024-09-15",
      "2025-03-15",
    ]);
    expect(
      days(
        rule({ freq: "yearly", byMonth: [11], byNthWeekday: [{ weekday: 4, nth: 4 }], count: 2 }),
      ),
    ).toEqual(["2024-11-28", "2025-11-27"]);
  });
});

describe("limits, exclusions and queries", () => {
  it("until is inclusive", () => {
    const base = { freq: "daily" as const, until: at("2024-01-03T09:00:00") };
    expect(days(rule(base))).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
    expect(days(rule({ ...base, until: at("2024-01-03T08:59:59.999") }))).toEqual([
      "2024-01-01",
      "2024-01-02",
    ]);
  });

  it("count and until together: whichever ends first", () => {
    expect(days(rule({ freq: "daily", count: 10, until: at("2024-01-03T23:00:00") }))).toHaveLength(
      3,
    );
    expect(days(rule({ freq: "daily", count: 2, until: at("2024-12-31T23:00:00") }))).toHaveLength(
      2,
    );
  });

  it("exclude removes dates after count is applied (RFC 5545 semantics)", () => {
    const r = rule({ freq: "daily", count: 5, exclude: ["2024-01-03", at("2024-01-04T22:00:00")] });
    expect(days(r)).toEqual(["2024-01-01", "2024-01-02", "2024-01-05"]);
  });

  it("between is half-open by default", () => {
    const r = rule({ freq: "daily" });
    const from = at("2024-01-02T09:00:00");
    const to = at("2024-01-05T09:00:00");
    expect(r.between(from, to).map((x) => x.day)).toEqual([2, 3, 4]);
    expect(r.between(from, to, { inclusiveEnd: true }).map((x) => x.day)).toEqual([2, 3, 4, 5]);
    expect(r.between(to, from)).toEqual([]);
  });

  it("after / before", () => {
    const r = rule({ freq: "weekly" });
    expect(r.after(at("2024-01-01T09:00:00"))?.toISODate()).toBe("2024-01-08");
    expect(r.after(at("2024-01-01T09:00:00"), { inclusive: true })?.toISODate()).toBe("2024-01-01");
    expect(r.after(at("2023-01-01T00:00:00"))?.toISODate()).toBe("2024-01-01");
    expect(r.before(at("2024-01-15T09:00:00"))?.toISODate()).toBe("2024-01-08");
    expect(r.before(at("2024-01-15T09:00:00"), { inclusive: true })?.toISODate()).toBe(
      "2024-01-15",
    );
    expect(r.before(at("2024-01-01T09:00:00"))).toBeNull();
    expect(rule({ freq: "daily", count: 2 }).after(at("2024-06-01T00:00:00"))).toBeNull();
  });

  it("is lazy: unbounded rules can be iterated and partially consumed", () => {
    const it = rule({ freq: "daily" }).occurrences();
    expect(it.next().value.toISODate()).toBe("2024-01-01");
    expect(it.next().value.toISODate()).toBe("2024-01-02");
  });

  it("all() refuses an endless rule without a limit", () => {
    expect(() => rule({ freq: "daily" }).all()).toThrow(/never ends/);
    expect(rule({ freq: "daily" }).all({ limit: 0 })).toEqual([]);
  });

  it("terminates for rules that can never match", () => {
    expect(rule({ freq: "yearly", byMonth: [2], byMonthDay: [30] }).all({ limit: 3 })).toEqual([]);
    expect(
      rule({ freq: "monthly", interval: 12, byMonthDay: [31] }, "2024-02-01T09:00:00").all({
        limit: 3,
      }),
    ).toEqual([]);
  });

  it("preserves the start's zone", () => {
    const r = rule({ freq: "daily", count: 1 });
    expect(r.all()[0]!.zone.name).toBe(NY);
  });
});

describe("validation", () => {
  const start = at("2024-01-01T09:00:00");
  it.each<[string, Partial<RecurrenceOptions>, RegExp]>([
    ["bad freq", { freq: "hourly" as never }, /freq must be/],
    ["interval 0", { freq: "daily", interval: 0 }, /interval/],
    ["interval 1.5", { freq: "daily", interval: 1.5 }, /interval/],
    ["count 0", { freq: "daily", count: 0 }, /count/],
    ["byWeekday on monthly", { freq: "monthly", byWeekday: [1] }, /only valid for daily or weekly/],
    [
      "byMonthDay on weekly",
      { freq: "weekly", byMonthDay: [1] },
      /only valid for monthly or yearly/,
    ],
    ["byMonth on monthly", { freq: "monthly", byMonth: [1] }, /only valid for yearly/],
    [
      "byNthWeekday on daily",
      { freq: "daily", byNthWeekday: [{ weekday: 1, nth: 1 }] },
      /monthly or yearly/,
    ],
    [
      "both monthday kinds",
      { freq: "monthly", byMonthDay: [1], byNthWeekday: [{ weekday: 1, nth: 1 }] },
      /not both/,
    ],
    ["monthday 32", { freq: "monthly", byMonthDay: [32] }, /byMonthDay/],
    ["monthday 0", { freq: "monthly", byMonthDay: [0] }, /byMonthDay/],
    ["weekday 8", { freq: "weekly", byWeekday: [8] }, /byWeekday/],
    ["empty weekday list", { freq: "weekly", byWeekday: [] }, /must not be empty/],
    ["month 13", { freq: "yearly", byMonth: [13] }, /byMonth/],
    ["nth 0", { freq: "monthly", byNthWeekday: [{ weekday: 1, nth: 0 }] }, /nth/],
    ["bad exclude", { freq: "daily", exclude: ["2024-02-30"] }, /does not exist/],
    ["weekStart 0", { freq: "weekly", weekStart: 0 }, /weekStart/],
  ])("%s", (_name, options, message) => {
    expect(() => new RecurrenceRule({ start, ...options } as RecurrenceOptions)).toThrow(message);
  });

  it("requires DateTime start/until", () => {
    expect(() => new RecurrenceRule({ freq: "daily", start: new Date() as never })).toThrow(
      ChronexaError,
    );
    expect(() => new RecurrenceRule({ freq: "daily", start, until: "2024" as never })).toThrow(
      /until/,
    );
  });
});
