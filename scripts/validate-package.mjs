// Validates the package exactly as a consumer would receive it:
//  1. `npm pack` contents are what we intend to publish (no src/, tests/, benchmarks/ ...)
//  2. publint and "are the types wrong" pass
//  3. the tarball installs into a clean project and works from ESM, CommonJS and TypeScript
//     (NodeNext in an ESM project, NodeNext in a CJS project, and Bundler resolution)
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const run = (cmd, args, cwd = root, opts = {}) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
const step = (name) => console.log(`\n▸ ${name}`);
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
  throw new Error(msg);
};

const work = mkdtempSync(join(tmpdir(), "chronexa-validate-"));
try {
  step("npm pack contents");
  const packJson = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", work]));
  const [pack] = packJson;
  const files = pack.files.map((f) => f.path);
  console.log(files.map((f) => `  ${f}`).join("\n"));
  const allowed = [
    /^dist\//,
    /^docs\/[^/]+\.md$/,
    /^(README|CHANGELOG)\.md$/,
    /^LICENSE$/,
    /^package\.json$/,
  ];
  const unexpected = files.filter((f) => !allowed.some((re) => re.test(f)));
  if (unexpected.length) fail(`unexpected files in package: ${unexpected.join(", ")}`);
  for (const required of [
    "dist/index.js",
    "dist/index.cjs",
    "dist/index.d.ts",
    "dist/index.d.cts",
    "README.md",
    "LICENSE",
    "package.json",
  ]) {
    if (!files.includes(required)) fail(`missing ${required} in package`);
  }
  console.log(
    `  ${files.length} files, ${(pack.size / 1024).toFixed(1)} kB packed, ${(pack.unpackedSize / 1024).toFixed(1)} kB unpacked`,
  );
  const tarball = join(work, pack.filename);

  step("publint");
  const lint = run("npx", ["publint", "--strict", tarball]);
  console.log(
    lint
      .trim()
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n"),
  );

  step("are the types wrong");
  console.log(
    run("npx", ["attw", "--pack", ".", "--profile", "node16"])
      .trim()
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n"),
  );

  const tsc = join(root, "node_modules/typescript/bin/tsc");
  const consumer = join(root, "tests/consumer");
  const install = (dir, type) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "consumer", version: "1.0.0", private: true, type }),
    );
    run(
      "npm",
      ["install", tarball, "--offline", "--no-audit", "--no-fund", "--ignore-scripts"],
      dir,
    );
  };

  step("ESM + CommonJS consumers (plain JavaScript)");
  const esmDir = join(work, "esm");
  install(esmDir, "module");
  cpSync(join(consumer, "esm.mjs"), join(esmDir, "esm.mjs"));
  cpSync(join(consumer, "cjs.cjs"), join(esmDir, "cjs.cjs"));
  console.log("  " + run("node", ["esm.mjs"], esmDir).trim());
  console.log("  " + run("node", ["cjs.cjs"], esmDir).trim());

  step("TypeScript consumers");
  const variants = [
    ["nodenext, ESM project", "module", { module: "NodeNext", moduleResolution: "NodeNext" }],
    [
      "nodenext, CommonJS project",
      "commonjs",
      { module: "NodeNext", moduleResolution: "NodeNext" },
    ],
    ["bundler resolution", "module", { module: "ESNext", moduleResolution: "Bundler" }],
  ];
  for (const [label, type, options] of variants) {
    const dir = join(work, `ts-${label.replace(/\W+/g, "-")}`);
    install(dir, type);
    cpSync(join(consumer, "index.ts"), join(dir, "index.ts"));
    const base = JSON.parse(readFileSync(join(consumer, "tsconfig.base.json"), "utf8"));
    base.compilerOptions = { ...base.compilerOptions, ...options };
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(base));
    run("node", [tsc, "-p", "."], dir);
    console.log(`  ✓ ${label}`);
  }
  console.log("\n✓ package validated");
} catch (e) {
  if (!process.exitCode) process.exitCode = 1;
  console.error(String(e.stdout ?? ""), String(e.stderr ?? ""), e.message);
} finally {
  rmSync(work, { recursive: true, force: true });
}
