import { describe, expect, it } from "vitest";
import { ChronexaError, DateTime, Duration, Interval } from "../src/index.js";

const t = (s: string) => DateTime.fromISO(`2024-01-01T${s}:00Z`, { zone: "utc" });
const iv = (a: string, b: string) => Interval.between(t(a), t(b));
const show = (i: Interval | null) =>
  i ? `${i.start.format("HH:mm")}-${i.end.format("HH:mm")}` : null;

describe("construction and endpoint semantics (half-open [start, end))", () => {
  it("accepts equal endpoints as an empty interval and rejects reversed ones", () => {
    expect(iv("10:00", "10:00").isEmpty).toBe(true);
    expect(() => iv("11:00", "10:00")).toThrow(/cannot end/);
    expect(show(Interval.fromUnordered(t("11:00"), t("10:00")))).toBe("10:00-11:00");
    expect(() => Interval.between(1 as never, t("10:00"))).toThrow(/start must be a DateTime/);
  });

  it("contains includes start and excludes end", () => {
    const i = iv("10:00", "11:00");
    expect(i.contains(t("10:00"))).toBe(true);
    expect(i.contains(t("10:59"))).toBe(true);
    expect(i.contains(t("11:00"))).toBe(false);
    expect(i.contains(t("09:59"))).toBe(false);
    expect(iv("10:00", "10:00").contains(t("10:00"))).toBe(false);
  });

  it("after / before", () => {
    expect(show(Interval.after(t("10:00"), { hours: 2 }))).toBe("10:00-12:00");
    expect(show(Interval.before(t("10:00"), { minutes: 30 }))).toBe("09:30-10:00");
    expect(() => Interval.after(t("10:00"), { hours: -1 })).toThrow(/cannot end/);
  });

  it("calendar durations use the start's zone calendar", () => {
    const i = Interval.after(
      DateTime.fromISO("2025-03-07T12:00:00", { zone: "America/New_York" }),
      { days: 1 },
    );
    expect(i.toDuration().toObject()).toEqual({ hours: 24 });
    const j = Interval.after(
      DateTime.fromISO("2025-03-09T00:00:00", { zone: "America/New_York" }),
      { days: 1 },
    );
    expect(j.toDuration().toObject()).toEqual({ hours: 23 });
    expect(j.toDuration("day").days).toBe(1);
    expect(j.length("hour")).toBe(23);
  });
});

describe("relations", () => {
  const a = iv("10:00", "12:00");

  it("overlaps", () => {
    expect(a.overlaps(iv("11:00", "13:00"))).toBe(true);
    expect(a.overlaps(iv("10:30", "11:30"))).toBe(true);
    expect(a.overlaps(iv("09:00", "13:00"))).toBe(true);
    expect(a.overlaps(a)).toBe(true);
    expect(a.overlaps(iv("12:00", "13:00"))).toBe(false); // adjacent
    expect(a.overlaps(iv("08:00", "10:00"))).toBe(false); // adjacent
    expect(a.overlaps(iv("13:00", "14:00"))).toBe(false);
    expect(a.overlaps(iv("11:00", "11:00"))).toBe(false); // empty never overlaps
    expect(iv("11:00", "11:00").overlaps(iv("11:00", "11:00"))).toBe(false);
  });

  it("abuts", () => {
    expect(a.abuts(iv("12:00", "13:00"))).toBe(true);
    expect(a.abuts(iv("08:00", "10:00"))).toBe(true);
    expect(a.abuts(iv("11:00", "13:00"))).toBe(false);
    expect(a.abuts(iv("12:01", "13:00"))).toBe(false);
  });

  it("engulfs", () => {
    expect(a.engulfs(iv("10:00", "12:00"))).toBe(true);
    expect(a.engulfs(iv("10:30", "11:30"))).toBe(true);
    expect(a.engulfs(iv("11:00", "11:00"))).toBe(true);
    expect(a.engulfs(iv("09:59", "11:00"))).toBe(false);
    expect(a.engulfs(iv("11:00", "12:01"))).toBe(false);
  });

  it("isBefore / isAfter an instant respect the exclusive end", () => {
    expect(a.isBefore(t("12:00"))).toBe(true);
    expect(a.isBefore(t("11:59"))).toBe(false);
    expect(a.isAfter(t("09:59"))).toBe(true);
    expect(a.isAfter(t("10:00"))).toBe(false);
  });

  it("equals compares instants, not zones", () => {
    const ny = Interval.between(
      t("10:00").toZone("America/New_York"),
      t("12:00").toZone("Asia/Tokyo"),
    );
    expect(ny.equals(a)).toBe(true);
    expect(ny.overlaps(a)).toBe(true);
  });
});

describe("set operations", () => {
  const a = iv("10:00", "12:00");

  it("intersection", () => {
    expect(show(a.intersection(iv("11:00", "13:00")))).toBe("11:00-12:00");
    expect(show(a.intersection(iv("10:30", "11:00")))).toBe("10:30-11:00");
    expect(show(a.intersection(a))).toBe("10:00-12:00");
    expect(a.intersection(iv("12:00", "13:00"))).toBeNull();
    expect(a.intersection(iv("13:00", "14:00"))).toBeNull();
    expect(a.intersection(iv("11:00", "11:00"))).toBeNull();
  });

  it("union joins overlapping and abutting intervals only", () => {
    expect(show(a.union(iv("11:00", "13:00")))).toBe("10:00-13:00");
    expect(show(a.union(iv("12:00", "13:00")))).toBe("10:00-13:00");
    expect(a.union(iv("12:01", "13:00"))).toBeNull();
    expect(show(a.union(iv("11:00", "11:00")))).toBe("10:00-12:00");
    expect(a.union(iv("13:00", "13:00"))).toBeNull();
  });

  it("gap", () => {
    expect(show(a.gap(iv("13:00", "14:00")))).toBe("12:00-13:00");
    expect(show(iv("13:00", "14:00").gap(a))).toBe("12:00-13:00");
    expect(a.gap(iv("12:00", "13:00"))).toBeNull(); // abutting: no gap
    expect(a.gap(iv("11:00", "13:00"))).toBeNull(); // overlapping
    expect(a.gap(iv("10:30", "11:00"))).toBeNull(); // nested
    expect(a.gap(iv("11:00", "11:00"))).toBeNull();
    expect(show(a.gap(iv("14:00", "14:00")))).toBe("12:00-14:00");
  });

  it("subtract", () => {
    expect(a.subtract(iv("11:00", "11:30")).map(show)).toEqual(["10:00-11:00", "11:30-12:00"]);
    expect(a.subtract(iv("09:00", "11:00")).map(show)).toEqual(["11:00-12:00"]);
    expect(a.subtract(iv("11:00", "13:00")).map(show)).toEqual(["10:00-11:00"]);
    expect(a.subtract(iv("09:00", "13:00"))).toEqual([]);
    expect(a.subtract(iv("12:00", "13:00")).map(show)).toEqual(["10:00-12:00"]);
  });

  it("merge combines overlapping and adjacent intervals and drops empty ones", () => {
    const merged = Interval.merge([
      iv("13:00", "14:00"),
      iv("10:00", "11:00"),
      iv("11:00", "12:00"),
      iv("10:30", "10:45"),
      iv("15:00", "15:00"),
      iv("12:30", "13:00"),
    ]);
    expect(merged.map(show)).toEqual(["10:00-12:00", "12:30-14:00"]);
    expect(Interval.merge([])).toEqual([]);
  });
});

describe("splitting", () => {
  it("splitAt", () => {
    expect(iv("10:00", "12:00").splitAt(t("11:00")).map(show)).toEqual([
      "10:00-11:00",
      "11:00-12:00",
    ]);
    expect(
      iv("10:00", "12:00").splitAt(t("10:00"), t("12:00"), t("09:00"), t("13:00")).map(show),
    ).toEqual(["10:00-12:00"]);
    expect(iv("10:00", "12:00").splitAt(t("11:30"), t("10:30"), t("11:30")).map(show)).toEqual([
      "10:00-10:30",
      "10:30-11:30",
      "11:30-12:00",
    ]);
    expect(iv("10:00", "10:00").splitAt(t("10:00"))).toEqual([]);
  });

  it("splitBy produces consecutive pieces with a short last piece", () => {
    expect(iv("10:00", "12:00").splitBy({ minutes: 45 }).map(show)).toEqual([
      "10:00-10:45",
      "10:45-11:30",
      "11:30-12:00",
    ]);
    expect(iv("10:00", "11:00").splitBy({ hours: 1 }).map(show)).toEqual(["10:00-11:00"]);
    expect(iv("10:00", "10:00").splitBy({ hours: 1 })).toEqual([]);
  });

  it("splitBy uses calendar arithmetic without month drift", () => {
    const i = Interval.between(
      DateTime.fromISO("2024-01-31T00:00:00Z", { zone: "utc" }),
      DateTime.fromISO("2024-05-31T00:00:00Z", { zone: "utc" }),
    );
    expect(i.splitBy({ months: 1 }).map((p) => p.end.toISODate())).toEqual([
      "2024-02-29",
      "2024-03-31",
      "2024-04-30",
      "2024-05-31",
    ]);
  });

  it("splitBy rejects non-positive durations", () => {
    expect(() => iv("10:00", "11:00").splitBy({})).toThrow(/strictly positive/);
    expect(() => iv("10:00", "11:00").splitBy({ hours: -1 })).toThrow(/strictly positive/);
    expect(() => iv("10:00", "11:00").splitBy({ days: 1, hours: -1 })).toThrow(/strictly positive/);
  });

  it("splitBy guards against runaway output", () => {
    const wide = Interval.between(
      DateTime.fromISO("2000-01-01T00:00:00Z"),
      DateTime.fromISO("2024-01-01T00:00:00Z"),
    );
    expect(() => wide.splitBy({ milliseconds: 1 })).toThrow(ChronexaError);
  });

  it("divideEqually tiles the interval exactly", () => {
    const parts = iv("10:00", "11:00").divideEqually(3);
    expect(parts.map(show)).toEqual(["10:00-10:20", "10:20-10:40", "10:40-11:00"]);
    const odd = Interval.between(
      DateTime.fromMillis(0, { zone: "utc" }),
      DateTime.fromMillis(10, { zone: "utc" }),
    ).divideEqually(3);
    expect(odd.map((p) => p.length())).toEqual([3, 3, 4]);
    expect(odd[0]!.start.toMillis()).toBe(0);
    expect(odd[2]!.end.toMillis()).toBe(10);
    expect(() => iv("10:00", "11:00").divideEqually(0)).toThrow(/positive integer/);
  });
});

describe("duration and serialization", () => {
  it("exposes length", () => {
    const i = iv("10:00", "11:30");
    expect(i.toDuration().toObject()).toEqual({ hours: 1, minutes: 30 });
    expect(i.length("minute")).toBe(90);
    expect(i.length("hour")).toBe(1.5);
    expect(i.toDuration(["hour", "minute"]).toObject()).toEqual({ hours: 1, minutes: 30 });
    expect(iv("10:00", "10:00").toDuration().isZero).toBe(true);
  });

  it("ISO round trip in all three forms", () => {
    const i = Interval.fromISO("2024-01-01T10:00:00Z/2024-01-01T12:00:00Z");
    expect(i.equals(iv("10:00", "12:00"))).toBe(true);
    expect(Interval.fromISO("2024-01-01T10:00:00Z/PT2H").end.toMillis()).toBe(
      t("12:00").toMillis(),
    );
    expect(Interval.fromISO("PT2H/2024-01-01T12:00:00Z").start.toMillis()).toBe(
      t("10:00").toMillis(),
    );
    expect(Interval.fromISO(iv("10:00", "12:00").toISO()).equals(iv("10:00", "12:00"))).toBe(true);
    expect(JSON.stringify(iv("10:00", "12:00"))).toBe(
      '"2024-01-01T10:00:00.000Z/2024-01-01T12:00:00.000Z"',
    );
  });

  it.each([
    "",
    "2024-01-01",
    "a/b",
    "2024-01-01T00:00Z/",
    "PT1H/PT1H",
    "2024-01-02T00:00Z/2024-01-01T00:00Z",
    "a/b/c",
  ])("rejects %j", (text) => {
    expect(Interval.tryFromISO(text).ok).toBe(false);
  });
});

describe("misc", () => {
  it("accepts Duration instances", () => {
    expect(show(Interval.after(t("10:00"), Duration.from({ hours: 1 })))).toBe("10:00-11:00");
  });
});
