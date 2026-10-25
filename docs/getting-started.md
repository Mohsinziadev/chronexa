# Getting Started

Chronexa is an immutable `DateTime` with strict parsing, explicit time-zone and DST handling, durations, intervals, business-day calendars and a recurrence engine. It has no runtime dependencies and is built on the platform's `Intl`.

> **Status: 0.1.0, pre-release.** The API is coherent and well tested, but it has not had real-world mileage. Expect small breaking changes before 1.0. See [Limitations](limitations.md).

## Install

```bash
npm install chronexa
```

Requires Node.js ≥ 20 or a modern browser with `Intl.DateTimeFormat` time-zone support and `Intl.RelativeTimeFormat`. ESM and CommonJS builds and TypeScript declarations are included.

```ts
import { DateTime, Duration, Interval } from "chronexa";
// const { DateTime } = require("chronexa");   // CommonJS works too
```

## Your first DateTime

```ts
import { DateTime } from "chronexa";

const now = DateTime.now({ zone: "America/New_York" }); // 2025-03-07T10:30:00.000-05:00

now.add({ days: 7 }).toISODate(); // "2025-03-14"
now.subtract({ months: 1 }).toISODate(); // "2025-02-07"
now.startOf("day").toISO(); // "2025-03-07T00:00:00.000-05:00"
now.endOf("month").toISO(); // "2025-03-31T23:59:59.999-04:00"  (DST starts on the 9th)
```

Every operation returns a new object. Nothing mutates.

## Invalid input fails loudly

```ts
DateTime.tryFromISO("2025-02-30");
// { ok: false, error: ChronexaError: … day 30 does not exist in 2025-02 … }
```

February 30 is an error, never March 1 or 2. Factories either return a usable value or throw a `ChronexaError` with a `code`; the `try*` variants return `{ ok, value | error }` instead. See [Errors & TypeScript](errors.md).

## Format and humanise

```ts
now.format("EEEE, d MMMM yyyy [at] HH:mm ZZZ", { locale: "en" }); // "Friday, 7 March 2025 at 10:30 EST"
now.toLocaleString({ dateStyle: "full", timeStyle: "short" }, "de"); // "Freitag, 7. März 2025 um 10:30"
now.subtract({ hours: 3 }).toRelative({ locale: "en" }); // "3 hours ago"
```

## Durations and intervals

```ts
Duration.from({ hours: 1, minutes: 90 }).normalize().toISO(); // "PT2H30M"
Interval.after(now, { hours: 1 }).contains(now.add({ hours: 1 })); // false  (intervals are [start, end))
```

## Where next

- [Core Concepts](concepts.md): the four things Chronexa keeps apart.
- [DateTime](datetime.md): creating, reading, arithmetic and differences.
- [Parsing](parsing.md) and [Formatting](formatting.md).
- [Time zones & DST](timezones.md): the part most libraries get wrong.
- Runnable versions of these snippets live in [`examples/`](../examples) (`npx tsx examples/quickstart.ts`).
