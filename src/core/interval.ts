import { DateTime, type ParseISOOptions } from "./datetime.js";
import { Duration, type DurationLike, type DurationUnit } from "./duration.js";
import { ChronexaError, attempt, invalidArg, type Result } from "./result.js";

const MAX_PIECES = 1_000_000;

function assertInterval(x: unknown, name = "other"): asserts x is Interval {
  if (!(x instanceof Interval)) throw invalidArg(`${name} must be an Interval.`);
}

function assertDT(x: unknown, name: string): asserts x is DateTime {
  if (!(x instanceof DateTime)) throw invalidArg(`${name} must be a DateTime.`);
}

function scale(d: Duration, k: number): Duration {
  const o = d.toObject() as Record<string, number>;
  for (const key of Object.keys(o)) o[key] = (o[key] as number) * k;
  return Duration.from(o as DurationLike);
}

/**
 * A span of time on the timeline, **half-open**: it contains `start` and everything up to
 * but **not including** `end` — `[start, end)`.
 *
 * Consequences, applied consistently by every method:
 * - `start == end` is a valid *empty* interval. It contains nothing and overlaps nothing.
 * - Two intervals where one's `end` equals the other's `start` do **not** overlap; they
 *   *abut* (`abuts()`), and `union()` joins them.
 * - `end` earlier than `start` is rejected (use {@link Interval.fromUnordered} to reorder).
 *
 * Endpoints are compared by instant; their zones are irrelevant to the comparisons.
 */
export class Interval {
  readonly start: DateTime;
  readonly end: DateTime;

  private constructor(start: DateTime, end: DateTime) {
    this.start = start;
    this.end = end;
    Object.freeze(this);
  }

  /** `[start, end)`. Throws if `end` is before `start`. */
  static between(start: DateTime, end: DateTime): Interval {
    assertDT(start, "start");
    assertDT(end, "end");
    if (end.toMillis() < start.toMillis()) {
      throw invalidArg(
        `An interval cannot end (${end.toISO()}) before it starts (${start.toISO()}). Use Interval.fromUnordered() to accept either order.`,
      );
    }
    return new Interval(start, end);
  }

  /** Orders the two instants so the earlier one is the start. */
  static fromUnordered(a: DateTime, b: DateTime): Interval {
    assertDT(a, "a");
    assertDT(b, "b");
    return a.toMillis() <= b.toMillis() ? new Interval(a, b) : new Interval(b, a);
  }

  /** `[start, start + duration)`. The duration must not be negative. */
  static after(start: DateTime, duration: DurationLike | Duration): Interval {
    assertDT(start, "start");
    return Interval.between(start, start.add(duration));
  }

  /** `[end − duration, end)`. The duration must not be negative. */
  static before(end: DateTime, duration: DurationLike | Duration): Interval {
    assertDT(end, "end");
    return Interval.between(end.subtract(duration), end);
  }

  /**
   * Parses `start/end`, `start/duration` or `duration/end` (ISO 8601). Options apply to the
   * date-time parts.
   */
  static fromISO(text: string, options: ParseISOOptions = {}): Interval {
    const parts = typeof text === "string" ? text.split("/") : [];
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      throw new ChronexaError(
        "PARSE_ERROR",
        `Cannot parse ${JSON.stringify(text)} as an ISO 8601 interval; expected "start/end", "start/duration" or "duration/end".`,
      );
    }
    const [a, b] = parts as [string, string];
    const isDur = (s: string) => /^[-+]?P/.test(s);
    if (isDur(a) && isDur(b))
      throw new ChronexaError("PARSE_ERROR", "An interval cannot have a duration at both ends.");
    if (isDur(b)) return Interval.after(DateTime.fromISO(a, options), Duration.fromISO(b));
    if (isDur(a)) return Interval.before(DateTime.fromISO(b, options), Duration.fromISO(a));
    return Interval.between(DateTime.fromISO(a, options), DateTime.fromISO(b, options));
  }

  static tryFromISO(text: string, options?: ParseISOOptions): Result<Interval> {
    return attempt(() => Interval.fromISO(text, options));
  }

  /**
   * Merges overlapping **and abutting** intervals into the smallest set of disjoint
   * intervals, sorted by start. Empty intervals are dropped.
   */
  static merge(intervals: Iterable<Interval>): Interval[] {
    const sorted = [...intervals].filter((i) => !i.isEmpty);
    sorted.forEach((i) => assertInterval(i, "each element"));
    sorted.sort(
      (x, y) => x.start.toMillis() - y.start.toMillis() || x.end.toMillis() - y.end.toMillis(),
    );
    const out: Interval[] = [];
    for (const i of sorted) {
      const last = out[out.length - 1];
      if (last && i.start.toMillis() <= last.end.toMillis()) {
        if (i.end.toMillis() > last.end.toMillis())
          out[out.length - 1] = new Interval(last.start, i.end);
      } else out.push(i);
    }
    return out;
  }

  get isEmpty(): boolean {
    return this.start.toMillis() === this.end.toMillis();
  }

  /** The exact elapsed length as a fixed-unit {@link Duration} (milliseconds, normalised). */
  toDuration(): Duration;
  /** The length spread over `units` (see `DateTime.diff`: calendar units are whole, in start's zone). */
  toDuration(units: DurationUnit | readonly DurationUnit[]): Duration;
  toDuration(units?: DurationUnit | readonly DurationUnit[]): Duration {
    if (units === undefined) {
      return Duration.fromMillis(this.end.toMillis() - this.start.toMillis()).normalize();
    }
    return this.end.diff(this.start, units);
  }

  /** Length in one unit (fractional for hour…millisecond; whole for calendar units). */
  length(unit: DurationUnit = "millisecond"): number {
    return this.end.diff(this.start, unit, { fractional: true }).get(unit);
  }

  /** `start ≤ instant < end`. */
  contains(instant: DateTime): boolean {
    assertDT(instant, "instant");
    const t = instant.toMillis();
    return this.start.toMillis() <= t && t < this.end.toMillis();
  }

  /** True when the intervals share at least one instant. Empty intervals never overlap. */
  overlaps(other: Interval): boolean {
    assertInterval(other);
    return (
      !this.isEmpty &&
      !other.isEmpty &&
      this.start.toMillis() < other.end.toMillis() &&
      other.start.toMillis() < this.end.toMillis()
    );
  }

  /** True when one interval ends exactly where the other starts. */
  abuts(other: Interval): boolean {
    assertInterval(other);
    return (
      this.end.toMillis() === other.start.toMillis() ||
      other.end.toMillis() === this.start.toMillis()
    );
  }

  /** True when `other` lies entirely within this interval (equal bounds allowed). */
  engulfs(other: Interval): boolean {
    assertInterval(other);
    return (
      this.start.toMillis() <= other.start.toMillis() && other.end.toMillis() <= this.end.toMillis()
    );
  }

  /** The whole interval is before `instant` (`end ≤ instant`). */
  isBefore(instant: DateTime): boolean {
    assertDT(instant, "instant");
    return this.end.toMillis() <= instant.toMillis();
  }

  /** The whole interval is after `instant` (`start > instant`). */
  isAfter(instant: DateTime): boolean {
    assertDT(instant, "instant");
    return this.start.toMillis() > instant.toMillis();
  }

  equals(other: Interval): boolean {
    assertInterval(other);
    return (
      this.start.toMillis() === other.start.toMillis() &&
      this.end.toMillis() === other.end.toMillis()
    );
  }

  /** The shared part, or `null` if the intervals do not overlap. */
  intersection(other: Interval): Interval | null {
    if (!this.overlaps(other)) return null;
    const start = this.start.toMillis() >= other.start.toMillis() ? this.start : other.start;
    const end = this.end.toMillis() <= other.end.toMillis() ? this.end : other.end;
    return new Interval(start, end);
  }

  /** One interval covering both, or `null` if they neither overlap nor abut. */
  union(other: Interval): Interval | null {
    assertInterval(other);
    if (this.isEmpty || other.isEmpty) {
      const full = this.isEmpty ? other : this;
      const point = this.isEmpty ? this : other;
      return full.start.toMillis() <= point.start.toMillis() &&
        point.end.toMillis() <= full.end.toMillis()
        ? full
        : null;
    }
    if (!this.overlaps(other) && !this.abuts(other)) return null;
    const start = this.start.toMillis() <= other.start.toMillis() ? this.start : other.start;
    const end = this.end.toMillis() >= other.end.toMillis() ? this.end : other.end;
    return new Interval(start, end);
  }

  /** The non-empty space between two disjoint intervals; `null` if they overlap, abut or nest. */
  gap(other: Interval): Interval | null {
    assertInterval(other);
    if (this.engulfs(other) || other.engulfs(this) || this.overlaps(other) || this.abuts(other))
      return null;
    const [first, second] =
      this.start.toMillis() <= other.start.toMillis() ? [this, other] : [other, this];
    return new Interval(first.end, second.start);
  }

  /** The parts of this interval not covered by `other` (0, 1 or 2 non-empty intervals). */
  subtract(other: Interval): Interval[] {
    assertInterval(other);
    if (!this.overlaps(other)) return this.isEmpty ? [] : [this];
    const out: Interval[] = [];
    if (other.start.toMillis() > this.start.toMillis())
      out.push(new Interval(this.start, other.start));
    if (other.end.toMillis() < this.end.toMillis()) out.push(new Interval(other.end, this.end));
    return out;
  }

  /** Cuts at the given instants. Instants outside (start, end) are ignored. */
  splitAt(...instants: DateTime[]): Interval[] {
    instants.forEach((i) => assertDT(i, "instant"));
    const s = this.start.toMillis();
    const e = this.end.toMillis();
    const cuts = [...new Set(instants.map((i) => i.toMillis()).filter((t) => t > s && t < e))].sort(
      (a, b) => a - b,
    );
    const out: Interval[] = [];
    let from = this.start;
    for (const t of cuts) {
      const at = instants.find((i) => i.toMillis() === t) as DateTime;
      out.push(new Interval(from, at));
      from = at;
    }
    out.push(new Interval(from, this.end));
    return this.isEmpty ? [] : out;
  }

  /**
   * Cuts into consecutive pieces of `duration`, measured from `start` with calendar
   * arithmetic (`start + k·duration`, so months do not drift). The last piece is shorter if
   * the interval is not an exact multiple. The duration must be strictly positive.
   */
  splitBy(duration: DurationLike | Duration): Interval[] {
    const d = Duration.from(duration);
    if (d.sign !== 1)
      throw invalidArg("splitBy needs a strictly positive duration with no mixed signs.");
    const out: Interval[] = [];
    const endMs = this.end.toMillis();
    let from = this.start;
    for (let k = 1; from.toMillis() < endMs; k++) {
      if (k > MAX_PIECES) {
        throw new ChronexaError(
          "UNBOUNDED",
          `splitBy would produce more than ${MAX_PIECES} pieces; use a larger duration.`,
        );
      }
      let to = this.start.add(scale(d, k));
      if (to.toMillis() <= from.toMillis()) {
        throw invalidArg(
          "The duration is too small to make progress when added to the start (it resolves to no elapsed time).",
        );
      }
      if (to.toMillis() > endMs) to = this.end;
      out.push(new Interval(from, to));
      from = to;
    }
    return out;
  }

  /** Divides into `count` pieces of (as near as possible) equal elapsed length that exactly tile the interval. */
  divideEqually(count: number): Interval[] {
    if (!Number.isInteger(count) || count < 1)
      throw invalidArg(`count must be a positive integer, received ${String(count)}.`);
    if (count > MAX_PIECES)
      throw new ChronexaError("UNBOUNDED", `count must not exceed ${MAX_PIECES}.`);
    const s = this.start.toMillis();
    const len = this.end.toMillis() - s;
    const bounds = Array.from({ length: count + 1 }, (_, i) =>
      i === count ? this.end : this.start.add({ milliseconds: Math.floor((i * len) / count) }),
    );
    return bounds.slice(0, -1).map((b, i) => new Interval(b, bounds[i + 1] as DateTime));
  }

  /** `start/end` in ISO 8601. */
  toISO(): string {
    return `${this.start.toISO()}/${this.end.toISO()}`;
  }

  toJSON(): string {
    return this.toISO();
  }

  toString(): string {
    return `[${this.start.toISO()}, ${this.end.toISO()})`;
  }
}
