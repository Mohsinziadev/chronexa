# Changelog

All notable changes are documented here. The project follows [Semantic Versioning](https://semver.org/);
while the major version is 0, minor releases may contain breaking changes.

## [0.1.0] - Unreleased

Initial release.

### Added

- `DateTime`: immutable instant + zone + locale; construction from millis, seconds, `Date`, components, ISO
  strings and custom formats; strict validation (no silent rollover); calendar and elapsed arithmetic;
  `startOf`/`endOf`; `diff`, `elapsed`, `calendarDiff`; ISO serialisation; token and `Intl` formatting;
  relative time.
- `Zone` (UTC, fixed offset, IANA via `Intl`), DST disambiguation (`compatible`/`earlier`/`later`/`reject`),
  `inspectLocalTime`, `resolveLocalTime`, `nextTransition`.
- `Duration` with explicit elapsed-vs-calendar semantics, ISO 8601 round trip, `normalize`, `shiftTo`, `as`, `compare`, `toHuman`.
- `Interval` with half-open semantics and set operations (`intersection`, `union`, `gap`, `subtract`, `merge`, `splitBy`, …).
- `BusinessCalendar` and rule-based `holidayProvider` (no built-in holiday data).
- `RecurrenceRule`: documented subset of RFC 5545 (not conformance-tested).
- `Result`-returning `try*` parsers and `ChronexaError` with machine-readable codes.
- Date utilities (`isLeapYear`, `daysInMonth`, `isoWeek`, `clamp`, `countDays`, …).
- ESM + CommonJS builds, TypeScript declarations, no runtime dependencies, `sideEffects: false`.
