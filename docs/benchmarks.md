# Benchmarks

These numbers come from `npm run bench` and `npm run size`, run on the machine described below.
They are **micro-benchmarks of equivalent jobs, not a ranking of libraries**, and they will differ on
your hardware, Node version and ICU build. Re-run them before drawing conclusions.

## How to reproduce

```bash
npm ci
npm run bench -- --markdown   # tables below
npm run size                  # bundle sizes below
```

## Methodology

- One seeded PRNG (`benchmarks/run.ts`) builds 1,000 instants between 2000 and 2039; every library gets
  the same inputs.
- Each case is warmed up (2,000 calls), calibrated so one sample lasts ≈150 ms, then sampled 9 times.
  The table shows the **median** ops/s and the min–max range across samples.
- Every result is folded into a sink so the JIT cannot discard the work.
- Native `Date`/`Intl` rows use a cached `Intl.DateTimeFormat`, i.e. the best case for the platform.

## Things that make the comparison imperfect

- **Semantics differ.** `Date.UTC` and `new Date(string)` do no time-zone resolution and (for strings)
  parse leniently; they are the floor, not a like-for-like competitor. Chronexa and Luxon both resolve
  wall times in a named zone, which costs `Intl` calls.
- **Laziness.** Chronexa's `DateTime` stores one integer and computes local fields on demand, so
  `fromMillis(...).toMillis()` does very little work (≈68M ops/s). That measures allocation, not a
  useful workload. Compare the rows that read fields, format or convert.
- Native arithmetic uses the process time zone (not New York), so it is not equivalent either.
- Luxon is not tree-shakeable; Chronexa is. Size numbers below are what an application bundles
  for the stated imports, not a measure of features (the two libraries have different feature sets).
- Single machine, single run, no isolation from other processes. Treat differences under ~20% as noise.

## Results

```text
node v22.23.1 (V8 12.4.254.21-node.56), ICU 78.2, tz data 2026a
Darwin 25.5.0 arm64, Apple M4 × 10
luxon 3.7.2, chronexa 0.1.0
dataset: 1000 seeded pseudo-random instants (2000–2039); 9 samples of ~150 ms per case; median ops/s [min–max]
```

#### construction from components (America/New_York wall time)

| case                                           | ops/s (median) |           range |
| ---------------------------------------------- | -------------: | --------------: |
| native Date.UTC (UTC only; no zone resolution) |         51.69M | 48.54M – 51.94M |
| luxon DateTime.fromObject                      |         139.5k | 138.3k – 140.0k |
| chronexa DateTime.fromObject                   |         136.3k |  91.6k – 144.9k |

#### construction from epoch milliseconds (UTC)

| case                         | ops/s (median) |           range |
| ---------------------------- | -------------: | --------------: |
| native new Date(ms)          |         30.83M | 27.56M – 32.75M |
| luxon DateTime.fromMillis    |          5.49M |   5.33M – 5.55M |
| chronexa DateTime.fromMillis |         67.29M | 65.72M – 68.52M |

#### ISO 8601 parsing ('…Z' strings)

| case                                          | ops/s (median) |           range |
| --------------------------------------------- | -------------: | --------------: |
| native new Date(string) (lenient, non-strict) |          9.57M |   9.51M – 9.67M |
| luxon DateTime.fromISO (zone: utc)            |         803.7k | 659.9k – 893.4k |
| chronexa DateTime.fromISO (zone: utc)         |          3.99M |   3.80M – 4.10M |

#### ISO 8601 parsing (local wall time in America/New_York)

| case                      | ops/s (median) |           range |
| ------------------------- | -------------: | --------------: |
| luxon DateTime.fromISO    |         126.0k | 123.2k – 128.6k |
| chronexa DateTime.fromISO |         141.1k | 136.0k – 142.2k |

#### formatting 'yyyy-MM-dd HH:mm:ss' in America/New_York (fresh object each time, so field computation is included)

| case                                                          | ops/s (median) |           range |
| ------------------------------------------------------------- | -------------: | --------------: |
| native Intl.DateTimeFormat('sv-SE').format (cached formatter) |          1.64M |   1.57M – 1.66M |
| luxon toFormat                                                |         247.0k | 244.0k – 249.4k |
| chronexa format                                               |         378.9k | 366.7k – 381.9k |

#### serialising to ISO 8601 (existing object, fields cached after first call)

| case               | ops/s (median) |         range |
| ------------------ | -------------: | ------------: |
| native toISOString |          2.02M | 1.76M – 2.06M |
| luxon toISO        |          6.15M | 5.94M – 6.32M |
| chronexa toISO     |          5.81M | 5.59M – 6.01M |

#### locale formatting {dateStyle:'medium', timeStyle:'short'}, en-US, America/New_York

| case                                | ops/s (median) |           range |
| ----------------------------------- | -------------: | --------------: |
| native Intl.DateTimeFormat (cached) |          1.80M |   1.59M – 1.85M |
| luxon toLocaleString                |         868.5k | 749.4k – 925.2k |
| chronexa toLocaleString             |          1.21M |   1.02M – 1.31M |

#### timezone conversion: UTC instant → Asia/Kolkata local hour

| case                                              | ops/s (median) |           range |
| ------------------------------------------------- | -------------: | --------------: |
| native Intl.DateTimeFormat (cached) → hour string |          4.46M |   4.39M – 4.50M |
| luxon setZone().hour                              |         303.7k | 301.2k – 305.0k |
| chronexa toZone().hour                            |         430.2k | 414.9k – 438.1k |

#### calendar arithmetic: +1 month +3 days +2 hours (America/New_York)

| case                                                          | ops/s (median) |           range |
| ------------------------------------------------------------- | -------------: | --------------: |
| native (setMonth/setDate/setHours, local zone of the process) |          4.90M |   4.82M – 4.91M |
| luxon plus                                                    |          97.3k |   87.4k – 99.1k |
| chronexa add                                                  |         143.5k | 143.2k – 145.6k |

#### start of month (America/New_York)

| case                      | ops/s (median) |           range |
| ------------------------- | -------------: | --------------: |
| luxon startOf('month')    |         160.8k | 160.2k – 161.0k |
| chronexa startOf('month') |         148.0k | 146.9k – 148.9k |

#### difference in whole days between two instants (America/New_York)

| case                    | ops/s (median) |         range |
| ----------------------- | -------------: | ------------: |
| luxon diff(…, 'days')   |          51.8k | 51.3k – 54.9k |
| chronexa diff(…, 'day') |          49.6k | 49.3k – 49.9k |

#### duration: build, add, normalise/shift to hours+minutes

| case                                         | ops/s (median) |           range |
| -------------------------------------------- | -------------: | --------------: |
| luxon Duration.fromObject().plus().shiftTo() |          1.12M |   1.12M – 1.13M |
| chronexa Duration.from().add().shiftTo()     |         956.7k | 954.3k – 957.8k |

#### duration ISO round trip

| case                       | ops/s (median) |         range |
| -------------------------- | -------------: | ------------: |
| luxon fromISO().toISO()    |          3.55M | 3.53M – 3.56M |
| chronexa fromISO().toISO() |          1.43M | 1.33M – 1.44M |

#### interval: build two intervals, overlaps + intersection

| case                         | ops/s (median) |           range |
| ---------------------------- | -------------: | --------------: |
| luxon Interval.fromDateTimes |         225.7k | 202.5k – 234.8k |
| chronexa Interval.between    |          2.49M |   2.46M – 2.50M |

#### business days: add 10 / count 90 days (Mon–Fri, UTC)

| case                                           | ops/s (median) |         range |
| ---------------------------------------------- | -------------: | ------------: |
| hand-written native loop: add 10 business days |          1.71M | 1.71M – 1.72M |
| chronexa addBusinessDays(10)                   |          3.47M | 3.47M – 3.48M |
| chronexa countBusinessDays (90-day span)       |          1.22M | 1.10M – 1.24M |

### Reading the results

- Where both libraries resolve named-zone wall times (`fromObject`, `fromISO` local, `toZone`,
  `add` with calendar units) they are in the same range: both pay for `Intl.DateTimeFormat`
  calls, which dominate. In this run `fromObject` was a tie (≈136k vs ≈140k ops/s, within noise) and
  Chronexa was roughly 10–50% ahead on local `fromISO`, `format`, `toZone` and `add`.
- Luxon was **faster** in this run for `startOf('month')`, `diff` in days, `Duration` ISO round trips
  and (marginally) `toISO`. Chronexa makes more `Intl` calls per zone resolution than it strictly needs
  because it verifies every local-time resolution rather than assuming no transition lies nearby;
  that is a deliberate correctness-over-speed trade-off (see `docs/timezones.md`).
- Chronexa's UTC / fixed-offset paths skip `Intl` entirely, which is why interval and business-day
  rows are fast.
- Nothing here supports a claim such as "N× faster than Luxon" in general.

## Bundle size

`npm run size` bundles small programs with esbuild (minified, ES2022, browser platform) against the
built `dist/index.js` and `luxon` from `node_modules`, and reports minified / gzip / brotli bytes.

```text
chronexa 0.1.0 vs luxon 3.7.2; esbuild minified, platform=browser, es2022; bytes
(a tiny `console.log` wrapper is included in every row, ~30 bytes)

scenario                                        min      gzip    brotli
chronexa { isLeapYear }                        1737       766       669
chronexa { Duration }                          8172      3406      3029
chronexa { DateTime }                         38089     13459     12092
chronexa { DateTime, Duration, Interval }     43104     14841     13309
chronexa { BusinessCalendar, DateTime }       40793     14360     12868
chronexa { RecurrenceRule, DateTime }         42838     15062     13543
chronexa * (everything)                       54105     18498     16565
luxon { DateTime }                            70900     21992     19659
luxon { DateTime, Duration, Interval }        70892     21992     19733
luxon * (everything)                          71187     22145     19823
```

Chronexa's modules are side-effect-free and the package declares `"sideEffects": false`, so importing
only `isLeapYear` or only `Duration` pulls in a small fraction of the library. `DateTime` brings in zone
resolution, parsing and formatting, which is most of the code. Luxon ships as one unit that bundlers
cannot split further, so its rows are almost identical regardless of imports.
