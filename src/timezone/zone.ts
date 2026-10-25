import { ChronexaError, invalidArg } from "../core/result.js";
import {
  daysFromCivil,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  MS_PER_SECOND,
  mod,
} from "../utils/calendar.js";

/**
 * How to pick an instant for a local wall-clock time that is affected by a daylight-saving
 * transition.
 *
 * - `"compatible"` (default): ambiguous → the **earlier** instant; nonexistent → shift
 *   **forward** by the gap (02:30 in a 02:00→03:00 gap becomes 03:30). Matches `Date` and Temporal.
 * - `"earlier"`: ambiguous → earlier instant; nonexistent → the wall time shifted **back** by the gap.
 * - `"later"`: ambiguous → later instant; nonexistent → shifted forward by the gap.
 * - `"reject"`: throw a {@link ChronexaError} for any ambiguous or nonexistent local time.
 */
export type Disambiguation = "compatible" | "earlier" | "later" | "reject";

/** What a local wall-clock time maps to in a zone. */
export interface LocalTimeInspection {
  /** `unique`: exactly one instant. `ambiguous`: two (fall-back). `gap`: none (spring-forward). */
  readonly status: "unique" | "ambiguous" | "gap";
  /** Matching instants as epoch ms, ascending. Empty for `gap`. */
  readonly instants: readonly number[];
  /** For a `gap`, the offsets (ms) before and after the transition. */
  readonly offsetBeforeMs?: number;
  readonly offsetAfterMs?: number;
}

export interface ZoneTransition {
  /** First instant (epoch ms) at which the new offset applies. */
  readonly at: number;
  readonly offsetBeforeMinutes: number;
  readonly offsetAfterMinutes: number;
}

export type ZoneKind = "utc" | "fixed" | "iana";
export type ZoneLike = Zone | string;

/** Earliest/latest instants for which `Intl` can be asked about a named zone (years 1–9999). */
const IANA_MIN_MS = -62_135_596_800_000;
const IANA_MAX_MS = 253_402_300_799_999;

/**
 * A time zone: something that maps an instant to a UTC offset.
 *
 * Three kinds exist and are intentionally not interchangeable:
 * `utc`, `fixed` (a constant offset such as `+05:30`, with no rules and no DST) and `iana`
 * (a named region such as `America/New_York`, whose offset changes over time).
 */
export abstract class Zone {
  abstract readonly kind: ZoneKind;
  /** `"UTC"`, an offset like `"+05:30"`, or an IANA identifier. */
  abstract readonly name: string;

  /** Offset from UTC, in milliseconds, in effect at the instant `ms`. */
  abstract offsetAt(ms: number): number;

  /** Offset from UTC in minutes (may be fractional for historical local mean time). */
  offsetMinutesAt(ms: number): number {
    return this.offsetAt(ms) / MS_PER_MINUTE;
  }

  /** Short display name, e.g. `"EST"`, `"GMT+1"`, `"UTC"`. Depends on runtime locale data. */
  abstract abbreviationAt(ms: number, locale?: string): string;

  /** Long display name, e.g. `"Eastern Standard Time"`. Depends on runtime locale data. */
  abstract longNameAt(ms: number, locale?: string): string;

  /** True when {@link offsetAt} is the same for every instant. */
  get isFixedOffset(): boolean {
    return this.kind !== "iana";
  }

  /** Same zone rules: UTC equals UTC, fixed offsets compare by offset, IANA aliases compare by canonical id. */
  equals(other: Zone): boolean {
    return this === other || (this.kind === other.kind && this.identity === other.identity);
  }

  /** Canonical identity used by {@link Zone.equals}. */
  protected get identity(): string {
    return this.name;
  }

  toString(): string {
    return this.name;
  }

  toJSON(): string {
    return this.name;
  }

  /**
   * Describes how the given local wall time (expressed as "local ms", i.e. the epoch ms the
   * wall clock would show if it were UTC) maps onto the timeline of this zone.
   */
  inspectLocal(localMs: number): LocalTimeInspection {
    const lo = Math.max(IANA_MIN_MS, Math.min(IANA_MAX_MS, localMs - MS_PER_DAY));
    const hi = Math.max(IANA_MIN_MS, Math.min(IANA_MAX_MS, localMs + MS_PER_DAY));
    const o1 = this.offsetAt(lo);
    const o2 = this.offsetAt(hi);
    const offsets = o1 === o2 ? [o1] : [o1, o2];
    const instants = offsets
      .map((o) => localMs - o)
      .filter((c) => this.offsetAt(c) === localMs - c)
      .sort((a, b) => a - b);
    if (instants.length === 1) return { status: "unique", instants };
    if (instants.length === 2) return { status: "ambiguous", instants };
    if (o1 === o2) {
      throw new ChronexaError(
        "UNSUPPORTED",
        `Zone "${this.name}" has several offset changes within 48 hours of the requested local time; it cannot be resolved reliably.`,
      );
    }
    return { status: "gap", instants: [], offsetBeforeMs: o1, offsetAfterMs: o2 };
  }

  /**
   * Converts a local wall time to an instant (epoch ms), applying `disambiguation` when the
   * time is ambiguous or nonexistent. `preferOffsetMs` resolves an ambiguity in favour of the
   * candidate with that offset (used so arithmetic does not jump between the two occurrences
   * of a repeated hour).
   */
  resolveLocal(
    localMs: number,
    disambiguation: Disambiguation = "compatible",
    preferOffsetMs?: number,
  ): number {
    const r = this.inspectLocal(localMs);
    if (r.status === "unique") return r.instants[0] as number;
    if (r.status === "ambiguous") {
      const [first, second] = r.instants as [number, number];
      if (preferOffsetMs !== undefined) {
        if (localMs - first === preferOffsetMs) return first;
        if (localMs - second === preferOffsetMs) return second;
      }
      if (disambiguation === "reject") {
        throw new ChronexaError(
          "AMBIGUOUS_LOCAL_TIME",
          `The local time ${describeLocal(localMs)} occurs twice in ${this.name} (clocks go back). ` +
            `Pass { disambiguation: "earlier" | "later" } to choose one, or "compatible" for the earlier.`,
        );
      }
      return disambiguation === "later" ? second : first;
    }
    if (disambiguation === "reject") {
      throw new ChronexaError(
        "NONEXISTENT_LOCAL_TIME",
        `The local time ${describeLocal(localMs)} does not exist in ${this.name} (clocks skip forward). ` +
          `Pass { disambiguation: "earlier" | "later" | "compatible" } to resolve it.`,
      );
    }
    const before = r.offsetBeforeMs as number;
    const after = r.offsetAfterMs as number;
    return disambiguation === "earlier" ? localMs - after : localMs - before;
  }

  /**
   * Finds the next offset change strictly after `afterMs`, scanning at most `maxDays` ahead.
   * Returns `null` if none is found (always `null` for UTC and fixed-offset zones).
   * Transitions that are reverted within one day of each other may be missed.
   */
  nextTransition(afterMs: number, maxDays = 800): ZoneTransition | null {
    if (this.isFixedOffset) return null;
    let lo = afterMs;
    let loOffset = this.offsetAt(lo);
    const end = Math.min(afterMs + maxDays * MS_PER_DAY, IANA_MAX_MS);
    while (lo < end) {
      const hi = Math.min(lo + MS_PER_DAY, end);
      const hiOffset = this.offsetAt(hi);
      if (hiOffset !== loOffset) {
        let a = lo; // offset(a) === loOffset
        let b = hi; // offset(b) !== loOffset
        while (b - a > 1) {
          const mid = Math.floor((a + b) / 2);
          if (this.offsetAt(mid) === loOffset) a = mid;
          else b = mid;
        }
        return {
          at: b,
          offsetBeforeMinutes: loOffset / MS_PER_MINUTE,
          offsetAfterMinutes: this.offsetAt(b) / MS_PER_MINUTE,
        };
      }
      lo = hi;
      loOffset = hiOffset;
    }
    return null;
  }

  /** The UTC zone. */
  static get utc(): Zone {
    return (utcZone ??= new UtcZone());
  }

  /**
   * The runtime's system zone, as reported by `Intl`. Resolved once and cached; call
   * {@link Zone.resetSystemZone} if the process time zone changes at runtime.
   */
  static system(): Zone {
    if (!systemZone) {
      const id = new Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!id) {
        throw new ChronexaError(
          "UNSUPPORTED",
          "This runtime does not report a system time zone via Intl. Set Settings.defaultZone or pass { zone } explicitly.",
        );
      }
      systemZone = Zone.iana(id);
    }
    return systemZone;
  }

  static resetSystemZone(): void {
    systemZone = undefined;
  }

  /** A named IANA zone such as `"America/New_York"`. Throws `INVALID_ZONE` if unknown. */
  static iana(id: string): Zone {
    if (typeof id !== "string" || id === "") throw invalidZone(String(id));
    const cached = ianaCache.get(id);
    if (cached) return cached;
    let canonical: string;
    try {
      canonical = ianaFormatter(id).resolvedOptions().timeZone;
    } catch (e) {
      throw invalidZone(id, e);
    }
    // Keep the identifier the caller used (ICU may prefer an older alias, e.g. Asia/Calcutta
    // for Asia/Kolkata); only fix letter case.
    const zone: Zone =
      canonical === "UTC"
        ? Zone.utc
        : new IanaZone(id.toLowerCase() === canonical.toLowerCase() ? canonical : id, canonical);
    ianaCache.set(id, zone);
    return zone;
  }

  /** A constant offset from UTC, in whole minutes (for example `330` for `+05:30`). */
  static fixedOffset(minutes: number): Zone {
    if (!Number.isInteger(minutes) || Math.abs(minutes) >= 24 * 60) {
      throw invalidArg(
        `Fixed offset must be a whole number of minutes strictly between -1440 and 1440, received ${String(minutes)}.`,
      );
    }
    return fixedZoneFromMs(minutes * MS_PER_MINUTE);
  }

  /**
   * Interprets a string: `"utc"`/`"UTC"`/`"Z"`, `"system"`/`"local"`, a fixed offset
   * (`"+05:30"`, `"-0800"`, `"UTC+2"`) or an IANA identifier.
   */
  static from(like: ZoneLike): Zone {
    if (like instanceof Zone) return like;
    if (typeof like !== "string") throw invalidZone(String(like));
    const lower = like.toLowerCase();
    if (lower === "utc" || lower === "z") return Zone.utc;
    if (lower === "system" || lower === "local") return Zone.system();
    const m = /^(?:utc|gmt)?([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(like);
    if (m) {
      const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
      return Zone.fixedOffset(m[1] === "-" ? -minutes : minutes);
    }
    return Zone.iana(like);
  }

  static isValid(like: string): boolean {
    try {
      Zone.from(like);
      return true;
    } catch {
      return false;
    }
  }
}

let utcZone: Zone | undefined;
let systemZone: Zone | undefined;
const ianaCache = new Map<string, Zone>();
const fixedCache = new Map<number, Zone>();

function invalidZone(id: string, cause?: unknown): ChronexaError {
  return new ChronexaError(
    "INVALID_ZONE",
    `"${id}" is not a recognised time zone. Use "UTC", a fixed offset like "+05:30", or an IANA identifier like "Europe/Paris" ` +
      `(note: the set of identifiers your runtime knows depends on its ICU data).`,
    cause === undefined ? undefined : { cause },
  );
}

function describeLocal(localMs: number): string {
  return new Date(localMs).toISOString().slice(0, 23).replace("T", " ");
}

/** @internal */
export function fixedZoneFromMs(offsetMs: number): Zone {
  let z = fixedCache.get(offsetMs);
  if (!z) {
    z = new FixedZone(offsetMs);
    fixedCache.set(offsetMs, z);
  }
  return z;
}

/**
 * Formats an offset. `extended` → `+05:30`, `basic` → `+0530`, `short` → `+5:30` / `+5`.
 * Seconds appear only for historical offsets that have them.
 * @internal
 */
export function formatOffset(
  offsetMs: number,
  style: "extended" | "basic" | "short" = "extended",
): string {
  const sign = offsetMs < 0 ? "-" : "+";
  const abs = Math.abs(offsetMs);
  const h = Math.floor(abs / MS_PER_HOUR);
  const m = Math.floor((abs % MS_PER_HOUR) / MS_PER_MINUTE);
  const s = Math.floor((abs % MS_PER_MINUTE) / MS_PER_SECOND);
  const p = (n: number) => String(n).padStart(2, "0");
  if (style === "short") return m === 0 ? `${sign}${h}` : `${sign}${h}:${p(m)}`;
  const sep = style === "extended" ? ":" : "";
  return `${sign}${p(h)}${sep}${p(m)}${s ? sep + p(s) : ""}`;
}

class UtcZone extends Zone {
  readonly kind = "utc";
  readonly name = "UTC";
  offsetAt(): number {
    return 0;
  }
  abbreviationAt(): string {
    return "UTC";
  }
  longNameAt(): string {
    return "Coordinated Universal Time";
  }
  override inspectLocal(localMs: number): LocalTimeInspection {
    return { status: "unique", instants: [localMs] };
  }
  override resolveLocal(localMs: number): number {
    return localMs;
  }
}

class FixedZone extends Zone {
  readonly kind = "fixed";
  readonly name: string;
  readonly #offsetMs: number;
  constructor(offsetMs: number) {
    super();
    this.#offsetMs = offsetMs;
    this.name = formatOffset(offsetMs);
  }
  offsetAt(): number {
    return this.#offsetMs;
  }
  abbreviationAt(): string {
    return this.#offsetMs === 0 ? "UTC" : `UTC${formatOffset(this.#offsetMs, "short")}`;
  }
  longNameAt(): string {
    return `UTC${this.name}`;
  }
  override inspectLocal(localMs: number): LocalTimeInspection {
    return { status: "unique", instants: [localMs - this.#offsetMs] };
  }
  override resolveLocal(localMs: number): number {
    return localMs - this.#offsetMs;
  }
}

const offsetFormatCache = new Map<string, Intl.DateTimeFormat>();

function ianaFormatter(id: string): Intl.DateTimeFormat {
  let f = offsetFormatCache.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: id,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    offsetFormatCache.set(id, f);
  }
  return f;
}

const nameFormatCache = new Map<string, Intl.DateTimeFormat>();

function nameOf(id: string, ms: number, style: "short" | "long", locale: string | undefined) {
  const key = `${id}|${locale ?? ""}|${style}`;
  let f = nameFormatCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale ?? "en-US", { timeZone: id, timeZoneName: style });
    nameFormatCache.set(key, f);
  }
  return f.formatToParts(ms).find((p) => p.type === "timeZoneName")?.value ?? id;
}

class IanaZone extends Zone {
  readonly kind = "iana";
  readonly name: string;
  readonly #fmt: Intl.DateTimeFormat;
  readonly #canonical: string;

  constructor(name: string, canonical: string) {
    super();
    this.name = name;
    this.#canonical = canonical;
    this.#fmt = ianaFormatter(name);
  }

  protected override get identity(): string {
    return this.#canonical;
  }

  offsetAt(ms: number): number {
    if (!(ms >= IANA_MIN_MS && ms <= IANA_MAX_MS)) {
      throw new ChronexaError(
        "OUT_OF_RANGE",
        `Named time zones are supported for years 1 through 9999 only; got an instant outside that range in "${this.name}". Use UTC or a fixed offset for extreme dates.`,
      );
    }
    const floored = ms - mod(ms, MS_PER_SECOND);
    let year = 0,
      month = 0,
      day = 0,
      hour = 0,
      minute = 0,
      second = 0;
    for (const part of this.#fmt.formatToParts(floored)) {
      switch (part.type) {
        case "year":
          year = +part.value;
          break;
        case "month":
          month = +part.value;
          break;
        case "day":
          day = +part.value;
          break;
        case "hour":
          hour = +part.value % 24;
          break;
        case "minute":
          minute = +part.value;
          break;
        case "second":
          second = +part.value;
          break;
      }
    }
    const asUtc =
      daysFromCivil(year, month, day) * MS_PER_DAY +
      hour * MS_PER_HOUR +
      minute * MS_PER_MINUTE +
      second * MS_PER_SECOND;
    return asUtc - floored;
  }

  abbreviationAt(ms: number, locale?: string): string {
    return nameOf(this.name, ms, "short", locale);
  }

  longNameAt(ms: number, locale?: string): string {
    return nameOf(this.name, ms, "long", locale);
  }
}
