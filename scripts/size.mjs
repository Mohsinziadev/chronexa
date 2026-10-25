// Measures real bundle sizes for representative import scenarios: minified with esbuild,
// then gzipped. Luxon is bundled the same way for reference. Run `npm run build` first.
import { build } from "esbuild";
import { gzipSync, brotliCompressSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const luxonVersion = JSON.parse(
  readFileSync(resolve(root, "node_modules/luxon/package.json"), "utf8"),
).version;
const chronexaVersion = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;

const scenarios = [
  [
    "chronexa",
    "{ isLeapYear }",
    `import { isLeapYear } from "chronexa"; console.log(isLeapYear(2024));`,
  ],
  [
    "chronexa",
    "{ Duration }",
    `import { Duration } from "chronexa"; console.log(Duration.from({ hours: 1 }).toISO());`,
  ],
  [
    "chronexa",
    "{ DateTime }",
    `import { DateTime } from "chronexa"; console.log(DateTime.now().toISO());`,
  ],
  [
    "chronexa",
    "{ DateTime, Duration, Interval }",
    `import { DateTime, Duration, Interval } from "chronexa"; console.log(DateTime, Duration, Interval);`,
  ],
  [
    "chronexa",
    "{ BusinessCalendar, DateTime }",
    `import { BusinessCalendar, DateTime } from "chronexa"; console.log(new BusinessCalendar().isBusinessDay(DateTime.now()));`,
  ],
  [
    "chronexa",
    "{ RecurrenceRule, DateTime }",
    `import { RecurrenceRule, DateTime } from "chronexa"; console.log(new RecurrenceRule({ freq: "daily", start: DateTime.now(), count: 1 }).all());`,
  ],
  ["chronexa", "* (everything)", `import * as c from "chronexa"; console.log(c);`],
  [
    "luxon",
    "{ DateTime }",
    `import { DateTime } from "luxon"; console.log(DateTime.now().toISO());`,
  ],
  [
    "luxon",
    "{ DateTime, Duration, Interval }",
    `import { DateTime, Duration, Interval } from "luxon"; console.log(DateTime, Duration, Interval);`,
  ],
  ["luxon", "* (everything)", `import * as l from "luxon"; console.log(l);`],
];

const rows = [];
for (const [lib, label, code] of scenarios) {
  const r = await build({
    stdin: { contents: code, resolveDir: root, loader: "js" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
    logLevel: "silent",
    alias: { chronexa: resolve(root, "dist/index.js") },
    treeShaking: true,
  });
  const bytes = r.outputFiles[0].contents;
  rows.push([
    `${lib} ${label}`,
    bytes.length,
    gzipSync(bytes, { level: 9 }).length,
    brotliCompressSync(bytes).length,
  ]);
}

console.log(
  `chronexa ${chronexaVersion} vs luxon ${luxonVersion}; esbuild minified, platform=browser, es2022; bytes`,
);
console.log("(a tiny `console.log` wrapper is included in every row, ~30 bytes)\n");
const w = Math.max(...rows.map((r) => r[0].length));
console.log(
  `${"scenario".padEnd(w)}  ${"min".padStart(8)}  ${"gzip".padStart(8)}  ${"brotli".padStart(8)}`,
);
for (const [name, min, gz, br] of rows)
  console.log(
    `${name.padEnd(w)}  ${String(min).padStart(8)}  ${String(gz).padStart(8)}  ${String(br).padStart(8)}`,
  );
