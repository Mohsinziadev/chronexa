# Durations & Intervals

## Durations

```ts
const d = Duration.from({ months: 1, days: 2, hours: 3 });
d.toISO(); // "P1M2DT3H"
Duration.fromISO("PT90M").normalize().toObject(); // { hours: 1, minutes: 30 }
Duration.from({ minutes: 150 }).shiftTo(["hour", "minute"]).toObject(); // { hours: 2, minutes: 30 }
Duration.from({ days: 1, hours: 12 }).toHuman({ locale: "en" }); // "1 day, 12 hours"

d.toMillis(); // throws: a month has no fixed length
d.toMillis({ relativeTo: DateTime.fromISO("2024-02-01", { zone: "utc" }) }); // depends on February 2024
Duration.from({ days: 1 }).as("hour", { relativeTo: dstStartDay }); // 23
```

`years`, `months`, `weeks`, `days` are **calendar** units (their length depends on the date); `hours` … `milliseconds` are **elapsed**. Chronexa never converts between the two without a `relativeTo` date. `compare()` and `equals()` follow the same rule.

## Intervals

`Interval` is **half-open**: `[start, end)`. Empty intervals (`start == end`) are valid and overlap nothing; `end < start` is rejected; intervals that share only a boundary _abut_ but do not _overlap_.

```ts
const a = Interval.between(t("10:00"), t("12:00"));

a.contains(t("12:00")); // false
a.overlaps(Interval.between(t("12:00"), t("13:00"))); // false (they abut)
a.intersection(Interval.between(t("11:00"), t("13:00"))); // [11:00, 12:00)
a.union(Interval.between(t("12:00"), t("13:00"))); // [10:00, 13:00)
a.gap(Interval.between(t("13:00"), t("14:00"))); // [12:00, 13:00)
a.subtract(Interval.between(t("11:00"), t("11:30"))); // [10:00, 11:00) and [11:30, 12:00)
a.splitBy({ minutes: 45 });
a.divideEqually(3);
a.splitAt(t("11:00"));
Interval.merge([a, b, c]); // sorted, disjoint; abutting intervals are joined
Interval.fromISO("2025-01-01T00:00Z/PT1H"); // start/end, start/duration, duration/end
```

Set operations with no answer (`intersection`, `gap`, …) return `null` rather than an empty or invalid interval.
