/**
 * The documentation sidebar. Each slug is a file in ../../docs (docs/<slug>.md); the pages are
 * rendered from those files at build time by content-plugin.ts, so README links and the site
 * never drift apart.
 */
export type DocLink = { slug: string; title: string; blurb: string };
export type DocGroup = { title: string; items: DocLink[] };

export const DOC_GROUPS: DocGroup[] = [
  {
    title: "Introduction",
    items: [
      {
        slug: "getting-started",
        title: "Getting Started",
        blurb: "Install chronexa and create your first DateTime.",
      },
      {
        slug: "concepts",
        title: "Core Concepts",
        blurb: "Instants, wall-clock time, zones and offsets, kept apart.",
      },
    ],
  },
  {
    title: "Guide",
    items: [
      {
        slug: "datetime",
        title: "DateTime",
        blurb: "Creating, reading, arithmetic and differences.",
      },
      { slug: "parsing", title: "Parsing", blurb: "Strict ISO 8601 and custom-format parsing." },
      {
        slug: "formatting",
        title: "Formatting",
        blurb: "Tokens, localised output and relative time.",
      },
      {
        slug: "timezones",
        title: "Time zones & DST",
        blurb: "Gaps, overlaps, disambiguation and scheduling recipes.",
      },
      {
        slug: "durations-intervals",
        title: "Durations & Intervals",
        blurb: "Elapsed vs calendar units and half-open ranges.",
      },
      {
        slug: "business-recurrence",
        title: "Business Days & Recurrence",
        blurb: "Calendars, holidays and RFC 5545 rules.",
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        slug: "errors",
        title: "Errors & TypeScript",
        blurb: "Error codes, Result helpers and compile-time safety.",
      },
      {
        slug: "benchmarks",
        title: "Benchmarks",
        blurb: "Measured against Luxon, with methodology and caveats.",
      },
      {
        slug: "limitations",
        title: "Limitations",
        blurb: "Compatibility and what is not supported yet.",
      },
    ],
  },
  {
    title: "Resources",
    items: [
      {
        slug: "migration-from-luxon",
        title: "Migrating from Luxon",
        blurb: "Task mapping and behavioural differences.",
      },
    ],
  },
];

export const DOC_PAGES: DocLink[] = DOC_GROUPS.flatMap((g) => g.items);
export const DEFAULT_DOC = "getting-started";
