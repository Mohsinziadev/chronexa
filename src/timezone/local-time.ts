import { DateTime, type DateTimeComponents } from "../core/datetime.js";
import { invalidArg } from "../core/result.js";
import { Zone, type Disambiguation, type ZoneLike } from "./zone.js";
import { assertValidFields } from "../utils/validate.js";
import { localMsFromFields } from "../utils/calendar.js";

export interface LocalTimeReport {
  /**
   * `unique`: one matching instant. `ambiguous`: the wall time happens twice (clocks went back).
   * `gap`: it never happens (clocks jumped forward).
   */
  status: "unique" | "ambiguous" | "gap";
  /** The real instants showing this wall time (1 for unique, 2 for ambiguous, 0 for a gap), earliest first. */
  candidates: DateTime[];
  /** What each non-throwing disambiguation strategy would pick. */
  resolved: { compatible: DateTime; earlier: DateTime; later: DateTime };
  /** For a gap: the offsets either side and how many minutes the clock skips. */
  gap?: { offsetBeforeMinutes: number; offsetAfterMinutes: number; lengthMinutes: number };
}

/**
 * Turns an intended local event time ("2025-03-09 02:30 in New York") into a concrete
 * instant. **Strict by default** (`disambiguation: "reject"`): a time that is ambiguous
 * or does not exist throws instead of silently picking an answer. Pass another strategy
 * to choose explicitly. Use {@link inspectLocalTime} to see what is going on.
 */
export function resolveLocalTime(
  components: DateTimeComponents,
  zone: ZoneLike,
  options: { disambiguation?: Disambiguation | undefined; locale?: string | undefined } = {},
): DateTime {
  return DateTime.fromObject(components, {
    zone,
    locale: options.locale,
    disambiguation: options.disambiguation ?? "reject",
  });
}

/** Reports whether a local wall time is unique, ambiguous or nonexistent in `zone`. */
export function inspectLocalTime(components: DateTimeComponents, zone: ZoneLike): LocalTimeReport {
  const z = Zone.from(zone);
  if (components === null || typeof components !== "object")
    throw invalidArg("inspectLocalTime expects local components.");
  const f = {
    year: components.year,
    month: components.month ?? 1,
    day: components.day ?? 1,
    hour: components.hour ?? 0,
    minute: components.minute ?? 0,
    second: components.second ?? 0,
    millisecond: components.millisecond ?? 0,
  };
  assertValidFields(f);
  const r = z.inspectLocal(localMsFromFields(f));
  const at = (d: Disambiguation) => DateTime.fromObject(components, { zone: z, disambiguation: d });
  const report: LocalTimeReport = {
    status: r.status,
    candidates: r.instants.map((ms) => DateTime.fromMillis(ms, { zone: z })),
    resolved: { compatible: at("compatible"), earlier: at("earlier"), later: at("later") },
  };
  if (r.status === "gap") {
    const before = (r.offsetBeforeMs as number) / 60_000;
    const after = (r.offsetAfterMs as number) / 60_000;
    report.gap = {
      offsetBeforeMinutes: before,
      offsetAfterMinutes: after,
      lengthMinutes: after - before,
    };
  }
  return report;
}

export interface TransitionInfo {
  /** First instant using the new offset. */
  at: DateTime;
  offsetBeforeMinutes: number;
  offsetAfterMinutes: number;
}

/**
 * The next UTC-offset change (typically a DST switch) after `from`, or `null` if none occurs
 * within `maxDays` (default 800) — always `null` for UTC and fixed offsets. Derived from the
 * runtime's `Intl` data, so it reflects that runtime's tz database version.
 */
export function nextTransition(
  zone: ZoneLike,
  from: DateTime,
  maxDays = 800,
): TransitionInfo | null {
  const z = Zone.from(zone);
  const t = z.nextTransition(from.toMillis(), maxDays);
  if (!t) return null;
  return {
    at: DateTime.fromMillis(t.at, { zone: z }),
    offsetBeforeMinutes: t.offsetBeforeMinutes,
    offsetAfterMinutes: t.offsetAfterMinutes,
  };
}
