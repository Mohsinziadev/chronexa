# Time zones, DST and scheduling

## The model

| Thing                    | What it is                                   | In Chronexa                                                 |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------- |
| **Instant**              | A point on the global timeline               | `DateTime` holds one integer, epoch milliseconds            |
| **Local date/time**      | What a wall clock shows (`2025-03-09 02:30`) | `dt.toObject()`, `DateTimeComponents`, `inspectLocalTime()` |
| **Time-zone identifier** | A named set of rules that changes over time  | `Zone.iana("America/New_York")` (`kind: "iana"`)            |
| **UTC offset**           | A constant (`-05:00`)                        | `Zone.fixedOffset(-300)` or `"-05:00"` (`kind: "fixed"`)    |

A `DateTime` is an instant _viewed through_ a `Zone`. Converting (`toZone`) never changes the instant. Creating a
`DateTime` from wall-clock components or offset-less text requires resolving local → instant, and that is where
DST bites.

A **fixed offset is not a zone**: `Zone.fixedOffset(-300)` is not `America/New_York`, never shifts for DST, and
`equals` says so. When text carries an offset (`…-05:00`) and you pass `setZone: true`, you get a fixed offset,
because an offset does not say which region the event belongs to. If you must store an event's future local time,
store the **local components + zone identifier**, not an offset.

## Local → instant: three outcomes

For a wall time `t` in zone `Z`:

- **unique** — exactly one instant has that wall time (almost always);
- **ambiguous** — clocks went _back_; the wall time happens twice (e.g. 01:30 on 2025-11-02 in New York);
- **gap** — clocks jumped _forward_; the wall time never happens (e.g. 02:30 on 2025-03-09 in New York).

`inspectLocalTime(components, zone)` reports which, with every candidate instant, what each strategy would
pick, and for a gap the offsets either side and its length. Zones with 30-minute shifts (`Australia/Lord_Howe`)
and day-long gaps (`Pacific/Apia`, 2011-12-30) are handled the same way and are covered by tests.

### Disambiguation

| `disambiguation`           | ambiguous                    | gap                                |
| -------------------------- | ---------------------------- | ---------------------------------- |
| `"compatible"` _(default)_ | earlier                      | forward by the gap (02:30 → 03:30) |
| `"earlier"`                | earlier                      | back by the gap (02:30 → 01:30)    |
| `"later"`                  | later                        | forward by the gap (02:30 → 03:30) |
| `"reject"`                 | throw `AMBIGUOUS_LOCAL_TIME` | throw `NONEXISTENT_LOCAL_TIME`     |

It is accepted by `fromObject`, `fromISO`, `fromFormat`, `set`, `add`, `subtract` and `resolveLocalTime`.
`"compatible"` matches the behaviour of `Date` and of Temporal's default. **`resolveLocalTime` is strict by default
(`"reject"`)**: it exists for scheduling code that must not guess.

Arithmetic (`add`, `set`, `startOf`) additionally _prefers the occurrence you are already in_: adding `{ days: 0 }`
to the second 01:30 stays on the second 01:30 instead of jumping to the first.

### How resolution works

Chronexa asks the runtime for the zone's offset one day before and one day after the wall time, forms the
candidate instants, and keeps those whose own offset matches. Two matches → ambiguous, one → unique, none → gap.
This costs a few `Intl` calls per resolution (it is why named-zone construction is slower than UTC; see
[benchmarks](benchmarks.md)) and assumes at most one offset change within that 48-hour window. All modern zones
satisfy that; if a zone ever did not, Chronexa throws `UNSUPPORTED` rather than return a possibly wrong instant.

## Elapsed vs calendar arithmetic

```ts
const evening = DateTime.fromISO("2025-03-08T22:00:00", { zone: "America/New_York" });
evening.add({ hours: 24 }).toISO(); // 2025-03-09T23:00:00.000-04:00   (24 elapsed hours; the day was 23 h long)
evening.add({ days: 1 }).toISO(); // 2025-03-09T22:00:00.000-04:00   (same wall time tomorrow)
```

`years`, `months`, `weeks`, `days` move the wall clock; `hours` and smaller move the instant. Calendar units are
applied first, then elapsed units. `Duration` refuses to turn calendar units into milliseconds without a
`relativeTo` date. Likewise `diff` measures calendar units on the receiver's wall clock while `elapsed` measures real time.
`startOf("day")` can be 00:00 or, where midnight is skipped, the first valid time after the gap; `endOf("day")`
is the instant before the _next_ day's start, so on a 23-hour day it is 23 hours later and on a 25-hour day, 25.

## Scheduling recipes

**One-off event at a local time** — strict, so a user typing a nonexistent time gets an error:

```ts
const event = resolveLocalTime(
  { year: 2025, month: 3, day: 9, hour: 2, minute: 30 },
  "America/New_York",
);
// throws NONEXISTENT_LOCAL_TIME; catch and ask the user, or pass { disambiguation: "later" }
```

**Recurring event at a wall-clock time** — `RecurrenceRule` keeps the wall time across DST changes and resolves each
occurrence with the policy you choose:

```ts
new RecurrenceRule({
  freq: "daily",
  start: DateTime.fromISO("2025-03-08T02:30", { zone: "America/New_York" }),
  count: 3,
}).all();
// 03-08 02:30-05:00, 03-09 03:30-04:00 (02:30 didn't exist), 03-10 02:30-04:00
```

**Storing events** — keep `{ local components, zone id }` for "wall-clock" events (meetings), and the epoch
milliseconds for "instant" events (logs, deadlines). Store the zone _identifier_; offsets go stale.

**When does DST change?** `nextTransition(zone, from)` returns the next offset change to the millisecond (scanning
up to 800 days by default).

## Runtime requirements and limits

- Named zones use `Intl.DateTimeFormat` with the `timeZone` option. Node ≥ 20 and evergreen browsers support it.
  Unknown identifiers throw `INVALID_ZONE`. Which identifiers exist (and aliases such as `Asia/Calcutta` vs `Asia/Kolkata`)
  depends on the runtime's ICU data. Chronexa keeps the identifier you passed and treats aliases of the same zone as equal.
- **Time-zone rules are not bundled.** Results reflect the tz-database version inside your runtime. Two environments
  can disagree about recent rule changes or ancient history. Chronexa makes no claim of historical accuracy beyond what
  that data provides. (Offsets with seconds, e.g. pre-1900 local mean time, are supported and printed as `±hh:mm:ss`.)
- Named zones are limited to years 1–9999; outside that, `OUT_OF_RANGE` is thrown. UTC and fixed offsets cover the whole
  `Date` range (±8.64e15 ms).
- `Intl.RelativeTimeFormat` / `Intl.ListFormat` are required for `toRelative` / `toHuman`.
- The system zone is detected once and cached; call `Settings.reset()` (or `Zone.resetSystemZone()`) after changing
  `process.env.TZ` at runtime.
- `isInDST` is a heuristic (offset larger than the smaller of 1 Jan / 1 Jul offsets), not an authority; for zones that
  use "negative DST" (e.g. Europe/Dublin) it reports summer time as DST.
- `ZZZ` (abbreviation) and `longNameAt` come from `Intl` and can differ between runtimes and locales; for some zones
  `Intl` gives `GMT+3`-style names instead of abbreviations.
