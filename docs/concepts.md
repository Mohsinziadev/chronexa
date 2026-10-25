# Core Concepts

Chronexa keeps four things apart, because mixing them up is where date bugs come from.

| Concept                                                  | Chronexa type                      | Example                |
| -------------------------------------------------------- | ---------------------------------- | ---------------------- |
| An **instant** on the global timeline                    | `DateTime` (epoch ms inside)       | `2025-03-09T07:00:00Z` |
| A **local calendar date/time** (wall clock)              | `toObject()`, `DateTimeComponents` | `2025-03-09 02:30`     |
| A **time-zone identifier** (rules that change over time) | `Zone` (`kind: "iana"`)            | `America/New_York`     |
| A **UTC offset** (a constant)                            | `Zone` (`kind: "fixed"`)           | `-05:00`               |

## The principles

- **Always valid.** There is no "invalid DateTime" object. Factories return a usable value or throw a `ChronexaError` with a `code`; the `try*` variants return `{ ok, value | error }` instead.
- **Immutable.** Every operation returns a new object.
- **No silent rollover.** Feb 30 is an error, never March 1 or 2. `add` clamps month ends (documented); `set` does not.
- **Nothing guesses about time zones.** Parsing text without an offset needs a zone (default: the system zone, overridable globally with `Settings.defaultZone` or per call). Ambiguous and nonexistent local times follow an explicit `disambiguation` policy.
- **Elapsed time ≠ calendar time.** `add({ hours: 24 })` and `add({ days: 1 })` differ across DST changes, by design.

## Elapsed vs calendar units

`years`, `months`, `weeks`, `days` are **calendar** units: their length depends on the date. `hours`, `minutes`, `seconds` and `milliseconds` are **elapsed** units. Chronexa never converts between the two without a `relativeTo` date.

```ts
const NY = "America/New_York";
const evening = DateTime.fromISO("2025-03-08T22:00:00", { zone: NY });

evening.add({ hours: 24 }).toISO(); // elapsed:  "2025-03-09T23:00:00.000-04:00"
evening.add({ days: 1 }).toISO(); //   calendar: "2025-03-09T22:00:00.000-04:00"
```

## Testing with a fixed clock

`DateTime.now()` honours `Settings.now`, so tests can inject a clock instead of mocking `Date`.

```ts
import { Settings, DateTime } from "chronexa";

Settings.now = () => Date.UTC(2025, 0, 1);
DateTime.now({ zone: "utc" }).toISODate(); // "2025-01-01"
```

## Browser and Node

No Node APIs are used. A test bundles the library for the browser and runs it in a bare V8 context with no `process`, `require` or `Buffer`.

```html
<script type="module">
  import { DateTime } from "https://cdn.jsdelivr.net/npm/chronexa/dist/index.js";
  console.log(DateTime.now({ zone: "Asia/Tokyo" }).toISO());
</script>
```

Named zones, locale names and relative-time wording come from the runtime's `Intl`/ICU data. Different runtimes can ship different tz-database versions and locale data; see [Time zones](timezones.md#runtime-requirements-and-limits).
