# Errors & TypeScript

## Error handling

| Situation                                                                                             | Behaviour                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Factories and arithmetic given bad input                                                              | **throw** `ChronexaError` with a `code`                                                                                |
| You'd rather not use `try/catch`                                                                      | `DateTime.tryFromISO / tryFromFormat / tryFromObject`, `Duration.tryFromISO`, `Interval.tryFromISO` return `Result<T>` |
| Set operations with no answer (`intersection`, `gap`, `after`, …)                                     | return `null`                                                                                                          |
| Anything that would require guessing (`Duration.toMillis` with months, DST ambiguity with `"reject"`) | throw; the message says how to fix it                                                                                  |

Error codes: `INVALID_ARGUMENT`, `INVALID_DATE`, `INVALID_ZONE`, `INVALID_LOCALE`, `PARSE_ERROR`, `AMBIGUOUS_LOCAL_TIME`, `NONEXISTENT_LOCAL_TIME`, `OUT_OF_RANGE`, `UNSUPPORTED`, `UNBOUNDED`.

```ts
const r = DateTime.tryFromISO(userInput);
if (!r.ok) return showError(r.error.message); // "Cannot parse "…": day 30 does not exist in 2025-02; invalid dates are never rolled over."
use(r.value);
```

## TypeScript

Strict types, no `any`. Unit arguments are closed unions (`"year" | "month" | …`); unsupported inputs fail at compile time, which is checked by type tests (`tests/types.test-d.ts`) and by compiling a consumer project against the packed tarball under NodeNext (ESM and CJS) and Bundler resolution.

```ts
dt.add({ day: 1 }); // ✗ duration keys are plural: { days: 1 }
dt.startOf("decade"); // ✗
dt.diff(other, "days"); // ✗ unit arguments are singular
new DateTime(); // ✗ use a factory
```

## The `Result` helpers

`ok`, `err` and `attempt` are exported for building your own `Result`-returning functions that match Chronexa's `try*` factories.
