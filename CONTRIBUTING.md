# Contributing

Thanks for helping. A few principles decide most review comments:

1. **Correctness over features.** Every exported function needs a defined contract and tests. Edge cases (DST, month ends,
   invalid input) are tested, not assumed.
2. **No silent behaviour.** If something would require guessing, throw with a message that says how to fix it.
3. **Explicit time zones.** Tests must never depend on the machine's zone or the current time. Pass `{ zone }`, and use
   `Settings.now` / `Settings.withNow` for the clock.
4. **No unmeasured claims** in code comments, docs or PRs about speed or size.

## Setup

```bash
npm ci
npm run check   # typecheck, lint, format check, tests, type tests, build, package validation
```

Useful scripts: `npm run dev` (watch build), `npm test`, `npm run test:tz` (runs the suite under three different
system zones), `npm run test:types`, `npm run format`, `npm run bench`, `npm run size`, `npm run docs` (TypeDoc → `docs/api`).
Deeper property-test soak: `FC_NUM_RUNS=5000 npx vitest run tests/properties.test.ts`.

## Code layout

```
src/core/       DateTime, Duration, Interval, Result/errors, Settings
src/timezone/   Zone (UTC/fixed/IANA), DST resolution, scheduling helpers
src/parsing/    ISO 8601 parser, format tokens, custom-format parser
src/formatting/ pattern formatter, relative time
src/calendar/   business days, holidays, recurrence
src/utils/      pure calendar maths, validation, public date helpers
tests/          unit, property, type (*.test-d.ts) and consumer fixtures
```

Keep modules acyclic and side-effect-free (the package declares `"sideEffects": false`). Avoid computed class keys and
top-level calls on classes you want tree-shaken. `npm run size` will show regressions.

## Pull requests

- Add or update tests for every behavioural change, including the failing case that motivated it.
- Update README/docs when behaviour or limits change, and add a CHANGELOG entry.
- Don't add runtime dependencies.
- Keep public types strict; run `npm run test:types`.
