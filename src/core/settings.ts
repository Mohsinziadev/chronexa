import { Zone, type ZoneLike } from "../timezone/zone.js";
import { checkLocale } from "../utils/validate.js";
import { invalidArg } from "./result.js";

let nowFn: () => number = () => Date.now();
let defaultZone: Zone | undefined;
let defaultLocale: string | undefined;

/**
 * Process-wide defaults. Every default can be overridden per call; prefer that in libraries.
 * Tests can inject a deterministic clock through {@link Settings.now} or
 * {@link Settings.withNow}.
 */
export const Settings = {
  /** Clock used by `DateTime.now()`. Returns epoch milliseconds. */
  get now(): () => number {
    return nowFn;
  },
  set now(fn: () => number) {
    if (typeof fn !== "function")
      throw invalidArg("Settings.now must be a function returning epoch milliseconds.");
    nowFn = fn;
  },

  /** Zone given to new instances when none is specified. Defaults to the system zone. */
  get defaultZone(): Zone {
    return defaultZone ?? Zone.system();
  },
  set defaultZone(zone: ZoneLike | undefined) {
    defaultZone = zone === undefined ? undefined : Zone.from(zone);
  },

  /** Locale used for formatting when none is specified. `undefined` = runtime default. */
  get defaultLocale(): string | undefined {
    return defaultLocale;
  },
  set defaultLocale(locale: string | undefined) {
    defaultLocale = checkLocale(locale);
  },

  /** Runs `fn` with a frozen clock at `ms`, then restores the previous clock. Synchronous only. */
  withNow<T>(ms: number, fn: () => T): T {
    const prev = nowFn;
    nowFn = () => ms;
    try {
      return fn();
    } finally {
      nowFn = prev;
    }
  },

  /** Restores the clock, default zone, default locale and re-detects the system zone. */
  reset(): void {
    nowFn = () => Date.now();
    defaultZone = undefined;
    defaultLocale = undefined;
    Zone.resetSystemZone();
  },
};
