# Limitations & Compatibility

## Compatibility

|                      |                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Node.js              | ≥ 20 (developed and tested locally on 22; the CI matrix covers 20, 22, 24)                                                          |
| Browsers             | Modern evergreen browsers with `Intl.DateTimeFormat` time zones and `Intl.RelativeTimeFormat` (ES2022 syntax, private class fields) |
| Module formats       | ESM (`import`), CommonJS (`require`), `.d.ts` / `.d.cts`                                                                            |
| Runtime dependencies | none                                                                                                                                |

## Known limitations

- Named zones are supported for years 1–9999 only (UTC and fixed offsets cover the full `Date` range).
- Time-zone data is whatever your runtime's ICU provides; historical accuracy is only as good as that data.
- No leap seconds. No non-Gregorian calendars (locale-formatted output via `Intl` may use them, token-based `format()` does not).
- Local-time resolution assumes at most one offset change in a 48-hour window around the time (true for all modern zones; it throws rather than guess otherwise).
- `isInDST` is a heuristic (offset greater than the smaller of the January and July offsets).
- `endOf("hour" | "minute" | "second")` uses elapsed boundaries, which differs from wall-clock boundaries only in zones that shift by a non-whole hour mid-hour.
- Recurrence is a subset of RFC 5545 and not conformance-tested. Business-day iteration is O(days).
- Sub-millisecond precision is not supported. ISO fractions are truncated, not rounded.
- Not yet run in real browsers or on Node 20/24 by the author; CI is configured to do so.

## Performance and size

Measured, not claimed: see [Benchmarks](benchmarks.md) for methodology, caveats and results (Chronexa is faster than Luxon on some operations and slower on others in the recorded run). A bundle importing `DateTime` was 38 kB minified / 13.5 kB gzip versus 71 kB / 22 kB for Luxon as bundled by esbuild (Luxon is not tree-shakeable and the libraries have different features).
