import { DateTime, inspectLocalTime } from "chronexa";

const NY = "America/New_York";
const gap = { year: 2025, month: 3, day: 9, hour: 2, minute: 30 };

export type Row = { label: string; value: string; ok: boolean };

const attempt = (fn: () => string): { value: string; ok: boolean } => {
  try {
    return { value: fn(), ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code;
    return { value: code ?? (error as Error).name, ok: false };
  }
};

/** What chronexa really returns for 02:30 on the night New York springs forward (computed while the page is built). */
export function dstRows(): Row[] {
  const evening = DateTime.fromISO("2025-03-08T22:00:00", { zone: NY });
  return [
    { label: "inspect", ...attempt(() => inspectLocalTime(gap, NY).status) },
    { label: "compatible", ...attempt(() => DateTime.fromObject(gap, { zone: NY }).toISO()) },
    {
      label: "earlier",
      ...attempt(() => DateTime.fromObject(gap, { zone: NY, disambiguation: "earlier" }).toISO()),
    },
    {
      label: "reject",
      ...attempt(() => DateTime.fromObject(gap, { zone: NY, disambiguation: "reject" }).toISO()),
    },
    { label: "+24 hours", ...attempt(() => evening.add({ hours: 24 }).toISO()) },
    { label: "+1 day", ...attempt(() => evening.add({ days: 1 }).toISO()) },
    { label: "Feb 30", ...attempt(() => DateTime.fromISO("2025-02-30", { zone: "utc" }).toISO()) },
  ];
}
