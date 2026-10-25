import { DateTime, RecurrenceRule, type RecurrenceOptions } from "chronexa";

type Input = { start: string; zone: string; rule: Omit<RecurrenceOptions, "start"> };

/** Occurrences keep the wall-clock time of `start` across DST changes. */
export function run({ start, zone, rule }: Input) {
  const occurrences = new RecurrenceRule({
    ...rule,
    start: DateTime.fromISO(start, { zone }),
  }).all();
  return occurrences.map((d, i) => ({
    label: `#${i + 1}`,
    value: `${d.format("EEE", { locale: "en" })}  ${d.toISO()}`,
  }));
}
