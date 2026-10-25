import { DateTime } from "chronexa";

type Input = { instant: string; zones: string[] };

/** One instant, shown on every wall clock in the list. */
export function run({ instant, zones }: Input) {
  const moment = DateTime.fromISO(instant, { zone: "utc" });
  return zones.map((zone) => {
    const local = moment.toZone(zone);
    return { label: zone, value: `${local.toISO()}  (${local.format("ZZZ")})` };
  });
}
