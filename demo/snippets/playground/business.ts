import { BusinessCalendar, DateTime } from "chronexa";

type Input = { start: string; days: number; weekend: number[]; holidays: string[] };

/** Business-day maths with your own weekend and holidays. Chronexa ships no holiday data. */
export function run({ start, days, weekend, holidays }: Input) {
  const cal = new BusinessCalendar({ weekend, holidays });
  const from = DateTime.fromISO(start, { zone: "utc" });
  const to = cal.addBusinessDays(from, days);
  return [
    { label: "start", value: `${from.toISODate()} (${from.format("EEEE", { locale: "en" })})` },
    {
      label: `+${days} business days`,
      value: `${to.toISODate()} (${to.format("EEEE", { locale: "en" })})`,
    },
    { label: "counted", value: String(cal.countBusinessDays(from, to)) },
    { label: "next business day", value: cal.nextBusinessDay(from).toISODate() },
  ];
}
