import { DateTime, inspectLocalTime, type Disambiguation, type DateTimeComponents } from "chronexa";

type Input = { local: DateTimeComponents; zone: string; disambiguation: Disambiguation };

/** A wall-clock time can be unique, repeated (fall back) or missing (spring forward). */
export function run({ local, zone, disambiguation }: Input) {
  const report = inspectLocalTime(local, zone);
  return [
    { label: "status", value: report.status },
    {
      label: "candidates",
      value: report.candidates.map((c) => c.toISO()).join("  |  ") || "(none)",
    },
    { label: disambiguation, value: DateTime.fromObject(local, { zone, disambiguation }).toISO() },
  ];
}
