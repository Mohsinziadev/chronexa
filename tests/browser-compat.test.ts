import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Bundles the library for the browser platform (esbuild fails on any Node built-in) and runs it
 * in a fresh V8 context that has only ECMAScript globals + Intl: no `process`, `require`,
 * `Buffer`, `module`, timers or `console`. This is a smoke test that the library does not depend
 * on Node, NOT a substitute for testing in real browsers.
 */
describe("runs without Node globals", () => {
  it("bundles for the browser and executes in a bare context", async () => {
    const result = await build({
      entryPoints: ["src/index.ts"],
      bundle: true,
      platform: "browser",
      format: "iife",
      globalName: "Chronexa",
      write: false,
      target: "es2022",
      logLevel: "silent",
    });
    const code = result.outputFiles[0]!.text;
    expect(code).not.toMatch(/require\(|from "node:|process\./);

    const out = runInNewContext(
      `${code}
       const { DateTime, Duration, Interval, BusinessCalendar, RecurrenceRule } = Chronexa;
       const d = DateTime.fromISO("2025-03-09T01:30:00", { zone: "America/New_York" });
       JSON.stringify({
         typeofProcess: typeof process, typeofRequire: typeof require,
         dst: d.add({ hours: 1 }).toISO(),
         parsed: DateTime.fromFormat("9 March 2025", "d MMMM yyyy", { zone: "utc", locale: "en" }).toISO(),
         rel: DateTime.fromISO("2025-01-01T00:00:00Z").toRelative({ base: DateTime.fromISO("2025-01-03T00:00:00Z"), locale: "en" }),
         dur: Duration.fromISO("P1DT2H").toHuman({ locale: "en" }),
         biz: new BusinessCalendar().addBusinessDays(DateTime.fromISO("2025-03-07T00:00:00Z", { zone: "utc" }), 1).toISODate(),
         rec: new RecurrenceRule({ freq: "daily", start: d, count: 2 }).all().length,
         iv: Interval.fromISO("2025-01-01T00:00:00Z/PT1H", { zone: "utc" }).toISO(),
       })`,
      Object.create(null),
    );
    expect(JSON.parse(out as string)).toEqual({
      typeofProcess: "undefined",
      typeofRequire: "undefined",
      dst: "2025-03-09T03:30:00.000-04:00",
      parsed: "2025-03-09T00:00:00.000Z",
      rel: "2 days ago",
      dur: "1 day, 2 hours",
      biz: "2025-03-10",
      rec: 2,
      iv: "2025-01-01T00:00:00.000Z/2025-01-01T01:00:00.000Z",
    });
  });
});
