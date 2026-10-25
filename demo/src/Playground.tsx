import { useMemo, useState } from "react";
import { run as runArithmetic } from "../snippets/playground/arithmetic";
import { run as runBusiness } from "../snippets/playground/business";
import { run as runDst } from "../snippets/playground/dst";
import { run as runRecurrence } from "../snippets/playground/recurrence";
import { run as runZones } from "../snippets/playground/zones";
import { Snippet } from "./Snippet";
import { docHref } from "./router";

const json = (value: unknown) => JSON.stringify(value, null, 2);

type Line = { label: string; value: string };
type Preset = {
  id: string;
  label: string;
  file: string;
  run: (input: never) => Line[];
  input: unknown;
  note: string;
  doc: string;
};

/** Each preset runs the exact file it displays (demo/snippets/playground/*.ts). */
const PRESETS: Preset[] = [
  {
    id: "zones",
    label: "Time zones",
    file: "playground/zones",
    run: runZones,
    input: {
      instant: "2025-06-15T12:00:00Z",
      zones: ["America/New_York", "Europe/Paris", "Asia/Kolkata", "Pacific/Auckland"],
    },
    note: 'One instant, many wall clocks. Try a fixed offset like "+05:30" or break a zone name to see INVALID_ZONE.',
    doc: "timezones",
  },
  {
    id: "dst",
    label: "DST gap",
    file: "playground/dst",
    run: runDst,
    input: {
      local: { year: 2025, month: 3, day: 9, hour: 2, minute: 30 },
      zone: "America/New_York",
      disambiguation: "compatible",
    },
    note: 'Change the date to 2025-11-02 at 01:30 for a repeated hour, or set disambiguation to "reject" to see the error.',
    doc: "timezones",
  },
  {
    id: "arithmetic",
    label: "Arithmetic",
    file: "playground/arithmetic",
    run: runArithmetic,
    input: { start: "2025-03-08T22:00:00", zone: "America/New_York", add: { days: 1 } },
    note: 'Swap { "days": 1 } for { "hours": 24 } and compare the clock time. Try { "months": 1 } from a 31st.',
    doc: "datetime",
  },
  {
    id: "business",
    label: "Business days",
    file: "playground/business",
    run: runBusiness,
    input: {
      start: "2025-12-24",
      days: 1,
      weekend: [6, 7],
      holidays: ["2025-12-25", "2025-12-26"],
    },
    note: "Weekend days are ISO weekdays. Use [5, 6] for a Friday–Saturday weekend.",
    doc: "business-recurrence",
  },
  {
    id: "recurrence",
    label: "Recurrence",
    file: "playground/recurrence",
    run: runRecurrence,
    input: {
      start: "2025-03-01T09:30:00",
      zone: "America/New_York",
      rule: { freq: "monthly", byNthWeekday: [{ weekday: 2, nth: 2 }], count: 5 },
    },
    note: "Second Tuesday of every month at 09:30 New York time. The wall-clock time holds across the DST change.",
    doc: "business-recurrence",
  },
];

type Outcome =
  { kind: "input-error" | "error"; message: string } | { kind: "result"; lines: Line[] };

function evaluate(preset: Preset, text: string): Outcome {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    return { kind: "input-error", message: `Input is not valid JSON: ${(error as Error).message}` };
  }
  try {
    return { kind: "result", lines: preset.run(input as never) };
  } catch (error) {
    const code = (error as { code?: string }).code;
    return { kind: "error", message: `${code ? `${code}: ` : ""}${(error as Error).message}` };
  }
}

export function Playground() {
  const [presetId, setPresetId] = useState(PRESETS[0]!.id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(PRESETS.map((p) => [p.id, json(p.input)])),
  );
  const input = inputs[preset.id]!;
  const outcome = useMemo(() => evaluate(preset, input), [preset, input]);

  return (
    <section className="playground" id="playground" aria-labelledby="playground-title">
      <div className="section-head">
        <p className="eyebrow eyebrow-brand">Playground</p>
        <h2 id="playground-title" className="section-title">
          Try it live. Edit the input, watch the result.
        </h2>
        <p className="section-lead">
          Every result below is computed in your browser by the same chronexa source this page
          documents. Nothing is mocked.
        </p>
      </div>

      <div className="pg-tabs" role="tablist" aria-label="Example">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === preset.id}
            onClick={() => setPresetId(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="pg-grid">
        <div className="pg-panel">
          <div className="pg-head">
            <span>Code</span>
            <span className="pg-file">{preset.file.split("/")[1]}.ts</span>
          </div>
          <Snippet name={preset.file} className="pg-code" />
        </div>

        <div className="pg-panel">
          <div className="pg-head">
            <span>Input</span>
            <button
              type="button"
              className="pg-reset"
              onClick={() => setInputs((all) => ({ ...all, [preset.id]: json(preset.input) }))}
            >
              Reset
            </button>
          </div>
          <textarea
            className="pg-editor"
            spellCheck={false}
            aria-label="Input JSON"
            value={input}
            onChange={(e) => setInputs((all) => ({ ...all, [preset.id]: e.target.value }))}
          />
        </div>

        <div className="pg-panel pg-result" aria-live="polite">
          <div className="pg-head">
            {outcome.kind === "result" ? (
              <span className="pg-status pg-pass">✓ Result</span>
            ) : (
              <span className="pg-status pg-fail">
                ✗ {outcome.kind === "error" ? "ChronexaError" : "Input"}
              </span>
            )}
          </div>
          <div className="pg-body">
            {outcome.kind !== "result" ? (
              <p className="pg-error">{outcome.message}</p>
            ) : (
              <ul className="pg-issues">
                {outcome.lines.map((line, i) => (
                  <li key={i}>
                    <div className="pg-issue-top">
                      <code className="pg-code-badge">{line.label}</code>
                    </div>
                    <p className="pg-value">{line.value}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
      <p className="pg-note">
        {preset.note} <a href={docHref(preset.doc)}>Read the docs →</a>
      </p>
    </section>
  );
}
