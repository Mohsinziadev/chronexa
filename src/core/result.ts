/** Machine-readable reason attached to every {@link ChronexaError}. */
export type ErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_DATE"
  | "INVALID_ZONE"
  | "INVALID_LOCALE"
  | "PARSE_ERROR"
  | "AMBIGUOUS_LOCAL_TIME"
  | "NONEXISTENT_LOCAL_TIME"
  | "OUT_OF_RANGE"
  | "UNSUPPORTED"
  | "UNBOUNDED";

/**
 * The only error type Chronexa throws on purpose. Programming errors in your own
 * code (e.g. passing a non-function) may still surface as native `TypeError`s.
 */
export class ChronexaError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChronexaError";
    this.code = code;
  }
}

/** Structured outcome returned by the `try*` family of functions. */
export type Result<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ChronexaError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(error: ChronexaError): Result<T> {
  return { ok: false, error };
}

/**
 * Runs `fn`, converting a thrown {@link ChronexaError} into an error result.
 * Any other exception is a bug and is re-thrown untouched.
 */
export function attempt<T>(fn: () => T): Result<T> {
  try {
    return ok(fn());
  } catch (e) {
    if (e instanceof ChronexaError) return err(e);
    throw e;
  }
}

/** @internal */
export function invalidArg(message: string): ChronexaError {
  return new ChronexaError("INVALID_ARGUMENT", message);
}
