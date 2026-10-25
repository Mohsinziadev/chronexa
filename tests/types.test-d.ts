import { describe, expectTypeOf, it } from "vitest";
import {
  BusinessCalendar,
  DateTime,
  Duration,
  Interval,
  RecurrenceRule,
  Zone,
  type ChronexaError,
  type DateTimeUnit,
  type Disambiguation,
  type DurationUnit,
  type Result,
} from "../src/index.js";

declare const dt: DateTime;
declare const dur: Duration;
declare const iv: Interval;

describe("public types", () => {
  it("factories return the right types", () => {
    expectTypeOf(DateTime.now()).toEqualTypeOf<DateTime>();
    expectTypeOf(DateTime.fromISO("2024-01-01")).toEqualTypeOf<DateTime>();
    expectTypeOf(DateTime.tryFromISO("2024-01-01")).toEqualTypeOf<Result<DateTime>>();
    expectTypeOf(Duration.from({ days: 1 })).toEqualTypeOf<Duration>();
    expectTypeOf(Interval.between(dt, dt)).toEqualTypeOf<Interval>();
    expectTypeOf(Zone.from("utc")).toEqualTypeOf<Zone>();
  });

  it("Result narrows", () => {
    const r = DateTime.tryFromISO("x");
    if (r.ok) expectTypeOf(r.value).toEqualTypeOf<DateTime>();
    else expectTypeOf(r.error).toEqualTypeOf<ChronexaError>();
  });

  it("getters", () => {
    expectTypeOf(dt.year).toBeNumber();
    expectTypeOf(dt.isLeapYear).toBeBoolean();
    expectTypeOf(dt.zone).toEqualTypeOf<Zone>();
    expectTypeOf(dt.locale).toEqualTypeOf<string | undefined>();
    expectTypeOf(dt.toISO()).toBeString();
    expectTypeOf(dt.toJSDate()).toEqualTypeOf<Date>();
    expectTypeOf(dt.compare(dt)).toEqualTypeOf<-1 | 0 | 1>();
  });

  it("unit parameters are closed unions", () => {
    expectTypeOf(dt.startOf).parameter(0).toEqualTypeOf<DateTimeUnit>();
    expectTypeOf<DateTimeUnit>().toEqualTypeOf<DurationUnit | "quarter">();
    expectTypeOf<DurationUnit>().toEqualTypeOf<
      "year" | "month" | "week" | "day" | "hour" | "minute" | "second" | "millisecond"
    >();
    expectTypeOf(dur.get).parameter(0).toEqualTypeOf<DurationUnit>();
    expectTypeOf<Disambiguation>().toEqualTypeOf<"compatible" | "earlier" | "later" | "reject">();
  });

  it("rejects unsupported inputs at compile time", () => {
    // @ts-expect-error month must be a number
    DateTime.fromObject({ year: 2024, month: "3" });
    // @ts-expect-error year is required
    DateTime.fromObject({ month: 3 });
    // @ts-expect-error duration keys are plural
    dt.add({ day: 1 });
    // @ts-expect-error unknown unit
    dt.startOf("decade");
    // @ts-expect-error diff takes singular units
    dt.diff(dt, "days");
    // @ts-expect-error elapsed supports elapsed units only
    dt.elapsed(dt, "day");
    // @ts-expect-error a Date is not a DateTime
    dt.isBefore(new Date());
    // @ts-expect-error unknown disambiguation
    DateTime.fromObject({ year: 2024 }, { disambiguation: "nearest" });
    // @ts-expect-error unknown recurrence frequency
    new RecurrenceRule({ freq: "hourly", start: dt });
    // @ts-expect-error start is required
    new RecurrenceRule({ freq: "daily" });
    // @ts-expect-error constructors of DateTime are private
    new DateTime();
    // @ts-expect-error weekend takes numbers
    new BusinessCalendar({ weekend: ["sat"] });
  });

  it("accepts intended inputs", () => {
    dt.add({ days: 1, hours: undefined });
    dt.add(dur);
    dt.diff(dt, ["month", "day"]);
    dt.startOf("quarter");
    DateTime.fromObject({ year: 2024 }, { zone: Zone.utc, disambiguation: "later" });
    new BusinessCalendar({ weekend: [5, 6] as const, holidays: ["2024-12-25", dt] });
    new BusinessCalendar({ holidays: (d) => d.month === 12 });
    new RecurrenceRule({ freq: "monthly", start: dt, byNthWeekday: [{ weekday: 1, nth: -1 }] });
    expectTypeOf(iv.toDuration()).toEqualTypeOf<Duration>();
    expectTypeOf(iv.toDuration("hour")).toEqualTypeOf<Duration>();
    expectTypeOf(new RecurrenceRule({ freq: "daily", start: dt }).all()).toEqualTypeOf<
      DateTime[]
    >();
  });
});
