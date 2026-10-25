import { DateTime, type DurationLike } from "chronexa";

type Input = { start: string; zone: string; add: DurationLike };

/** The same amount of time, counted as elapsed units and as calendar units. */
export function run({ start, zone, add }: Input) {
  const from = DateTime.fromISO(start, { zone });
  const to = from.add(add);
  return [
    { label: "start", value: from.toISO() },
    { label: "add", value: to.toISO() },
    { label: "elapsed hours", value: String(to.elapsed(from, "hour")) },
    {
      label: "calendar diff",
      value: JSON.stringify(to.diff(from, ["month", "day", "hour"]).toObject()),
    },
    { label: "end of month", value: to.endOf("month").toISO() },
  ];
}
