import { useState, type CSSProperties, type ReactNode } from "react";
import { DOC_GROUPS } from "./docs-nav";
import { ArrowRight, CheckIcon, CopyIcon, GitHubIcon, Logo } from "./icons";
import {
  CHANGELOG_URL,
  installCommand,
  M2TOOLKIT,
  NPM_URL,
  PACKAGE_MANAGERS,
  PACKAGES_URL,
  PKG,
  RELATED,
  REPO,
  type PackageManager,
} from "./meta";
import { Playground } from "./Playground";
import { docHref } from "./router";
import { dstRows } from "./samples";
import { Snippet } from "./Snippet";

function Install() {
  const [pm, setPm] = useState<PackageManager>("npm");
  const [copied, setCopied] = useState(false);
  const command = installCommand(pm);
  return (
    <div className="install">
      <div className="install-tabs" role="tablist" aria-label="Package manager">
        {PACKAGE_MANAGERS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={p === pm}
            onClick={() => setPm(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="install-cmd">
        <span className="install-prompt" aria-hidden="true">
          $
        </span>
        <code>{command}</code>
        <button
          type="button"
          className="install-copy"
          aria-label={copied ? "Copied" : `Copy "${command}"`}
          onClick={() =>
            void navigator.clipboard?.writeText(command).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            })
          }
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

/** A terminal printing what chronexa really returns on the night New York springs forward (computed at build time). */
function Terminal() {
  const rows = dstRows();
  const failed = rows.filter((r) => !r.ok);
  return (
    <div
      className="terminal"
      role="img"
      aria-label="Terminal output of chronexa on the night New York springs forward: a 02:30 that does not exist resolves to 03:30, adding 24 hours and adding one day differ, and February 30 is rejected."
    >
      <div className="terminal-bar" aria-hidden="true">
        <span />
        <span />
        <span />
        <em>spring-forward.ts</em>
      </div>
      <pre className="terminal-body" aria-hidden="true">
        <span className="t-dim">$ </span>node --run dst{"\n\n"}
        <span className="t-dim"> 2025-03-09 02:30 America/New_York{"\n\n"}</span>
        {rows.map((r) => (
          <span key={r.label} className="t-row">
            <span className={r.ok ? "t-pass" : "t-fail"}>{r.ok ? "✓" : "✗"}</span>{" "}
            <span className="t-key">{r.label.padEnd(10)}</span>{" "}
            {r.ok ? (
              <span className="t-val">{r.value}</span>
            ) : (
              <span className="t-err">{r.value}</span>
            )}
            {"\n"}
          </span>
        ))}
        {"\n"}
        <span className="t-dim"> Resolved </span>
        <span className="t-pass">{rows.length - failed.length}</span>{" "}
        <span className="t-dim">explicitly</span>
        {"\n"}
        <span className="t-dim"> Rejected </span>
        <span className="t-fail">{failed.length}</span>{" "}
        <span className="t-dim">instead of guessing</span>
        {"\n\n"}
        <span className="t-pass-badge">PASS</span>{" "}
        <span className="t-val">no silent rollover, no surprises</span>
      </pre>
    </div>
  );
}

const FEATURES: { title: string; body: ReactNode; visual: ReactNode; art?: boolean }[] = [
  {
    title: "Invalid dates fail loudly",
    body: (
      <>
        There is no &quot;invalid DateTime&quot; object. Factories return a usable value or throw a{" "}
        <code>ChronexaError</code> with a stable <code>code</code>; the <code>try*</code> variants
        return <code>{"{ ok, value | error }"}</code> if you would rather not use{" "}
        <code>try/catch</code>. February 30 is an error, never March 1 or 2.
      </>
    ),
    visual: <Snippet name="strict" />,
  },
  {
    title: "Elapsed time is not calendar time",
    body: (
      <>
        <code>add({"{ hours: 24 }"})</code> and <code>add({"{ days: 1 }"})</code> differ across a
        DST change, by design. Chronexa never converts between calendar and elapsed units without a{" "}
        <code>relativeTo</code> date.
      </>
    ),
    visual: <Snippet name="arithmetic" />,
  },
  {
    title: "DST, handled explicitly",
    body: (
      <>
        A wall-clock time can be unique, repeated or missing. Inspect it with{" "}
        <code>inspectLocalTime</code> and choose a <code>disambiguation</code> policy:{" "}
        <code>compatible</code>, <code>earlier</code>, <code>later</code> or <code>reject</code>.
        Nothing guesses about time zones.
      </>
    ),
    visual: <Snippet name="dst" className="snippet-floating" />,
    art: true,
  },
  {
    title: "Scheduling built in",
    body: (
      <>
        Half-open <code>Interval</code>s, a <code>BusinessCalendar</code> with your own weekend and
        holidays, and a recurrence engine covering a documented subset of RFC 5545. Occurrences keep
        their wall-clock time across DST.
      </>
    ),
    visual: <Snippet name="schedule" />,
  },
  {
    title: "Small, safe, dependency-free",
    body: (
      <>
        Built on the platform&apos;s <code>Intl</code> with no runtime dependencies and no Node
        built-ins. It is tree-shakeable, ships ESM and CommonJS builds, and is checked with type
        tests and a bundled-for-the-browser smoke test.
      </>
    ),
    visual: (
      <ul className="checklist">
        {[
          ["Immutable", "every operation returns a new object"],
          ["Tree-shakeable", "import only the helpers you use"],
          ["No Node APIs", "runs in browsers, workers and Node"],
          ["Injectable clock", "Settings.now makes tests deterministic"],
          ["Strict parsing", "never leans on Date.parse"],
        ].map(([title, note]) => (
          <li key={title}>
            <CheckIcon />
            <span>
              <strong>{title}</strong> {note}
            </span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: "Mistakes fail at compile time",
    body: (
      <>
        Unit arguments are closed unions and duration keys are plural, so typos like{" "}
        <code>{"{ day: 1 }"}</code> or <code>startOf(&quot;decade&quot;)</code> do not compile.
        Strict types, no <code>any</code>.
      </>
    ),
    visual: (
      <div className="mini-terminal" aria-hidden="true">
        <span className="t-dim">&gt;</span> dt.add({"{ day: 1 }"}){"\n"}
        <span className="t-fail">✗</span>{" "}
        <span className="t-dim">duration keys are plural: {"{ days: 1 }"}</span>
        {"\n"}
        <span className="t-dim">&gt;</span> dt.startOf(&apos;decade&apos;){"\n"}
        <span className="t-fail">✗</span> <span className="t-dim">not a DateTime unit</span>
        {"\n"}
        <span className="t-dim">&gt;</span> dt.diff(other, &apos;days&apos;){"\n"}
        <span className="t-fail">✗</span> <span className="t-dim">unit arguments are singular</span>
      </div>
    ),
  },
];

const STATS = [
  { value: "0", label: "Zero dependencies" },
  { value: "13.5 kB", label: "min+gzip for DateTime, vs 22 kB for Luxon" },
  { value: "4", label: "ways to resolve a missing or repeated hour" },
  { value: "ESM + CJS", label: "Node.js 20+ and modern browsers" },
];

export function Home() {
  return (
    <main id="main" tabIndex={-1} className="home-view">
      <div className="frame">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              by <a href={PACKAGES_URL}>M2Toolkit</a> <span className="eyebrow-sep">·</span> v
              {PKG.version}
            </p>
            <h1 className="hero-title">
              Modern dates.
              <br />
              Explicit time zones.
            </h1>
            <p className="hero-tagline">
              An immutable date and time toolkit for JavaScript and TypeScript. Strict parsing, DST
              handled explicitly.
            </p>
            <div className="hero-actions">
              <a className="btn btn-brand" href={docHref("getting-started")}>
                Get Started
              </a>
              <a className="btn" href={REPO} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
            </div>
            <Install />
          </div>
          <div className="hero-art art">
            <Terminal />
          </div>
        </section>

        <section className="why" aria-labelledby="why-title">
          <div>
            <p className="eyebrow eyebrow-brand">
              <CheckIcon /> Why chronexa
            </p>
            <h2 id="why-title" className="section-title">
              One clock model.
              <br />
              Instants, zones and durations.
            </h2>
            <a className="btn" href={docHref("concepts")}>
              Learn more
            </a>
          </div>
          <div className="why-copy">
            <p>
              Chronexa keeps instants, wall-clock times, time-zone identifiers and UTC offsets
              apart, because mixing them up is where date bugs come from. Invalid dates are errors,
              and ambiguous times follow a policy you choose.
            </p>
            <p>
              Parse, format, add, diff, convert between zones, count business days and expand
              recurrence rules with one small API. Framework-agnostic: no dependencies, no Node.js
              built-ins, and the same code runs in Node.js and the browser.
            </p>
            <Snippet name="hero" />
          </div>
        </section>

        <section className="statement">
          <h2 className="statement-title">Explicit. Immutable. Dependency-free.</h2>
        </section>

        <section className="features" id="features" aria-label="Features">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <div className={f.art ? "feature-visual art" : "feature-visual"}>{f.visual}</div>
            </article>
          ))}
        </section>
        <div className="features-more">
          <a className="btn" href={docHref("datetime")}>
            Read the DateTime guide
          </a>
        </div>

        <Playground />

        <section className="stats" aria-label="chronexa in numbers">
          {STATS.map((s) => (
            <div key={s.label} className="stat">
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </section>

        <section className="docs-index" id="documentation" aria-labelledby="docs-index-title">
          <div className="section-head">
            <p className="eyebrow eyebrow-brand">
              <CheckIcon /> Documentation
            </p>
            <h2 id="docs-index-title" className="section-title">
              Everything, from your first DateTime to DST-safe scheduling.
            </h2>
          </div>
          <div className="docs-index-groups">
            {DOC_GROUPS.map((g) => (
              <div key={g.title} className="docs-index-group">
                <h3>{g.title}</h3>
                <ul>
                  {g.items.map((d) => (
                    <li key={d.slug}>
                      <a href={docHref(d.slug)}>
                        <span className="docs-index-title">
                          {d.title} <ArrowRight width={14} height={14} />
                        </span>
                        <span className="docs-index-blurb">{d.blurb}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="related" aria-labelledby="related-title">
          <div className="section-head">
            <p className="eyebrow">m2toolkit</p>
            <h2 id="related-title" className="section-title">
              More open-source packages from M2Toolkit.
            </h2>
          </div>
          <ul className="related-list">
            {RELATED.map((p) => (
              <li key={p.slug}>
                <a href={p.url} style={{ "--accent": p.accent } as CSSProperties}>
                  <span className="related-dot" aria-hidden="true" />
                  <span className="related-title">{p.title}</span>
                  <span className="related-tag">{p.tagline}</span>
                  <span className="related-go">
                    /npm-packages/{p.slug} <ArrowRight width={14} height={14} />
                  </span>
                </a>
              </li>
            ))}
            <li>
              <a href={PACKAGES_URL} className="related-all">
                <span className="related-title">All npm packages</span>
                <span className="related-tag">Every package we publish, with live previews.</span>
                <span className="related-go">
                  browse all <ArrowRight width={14} height={14} />
                </span>
              </a>
            </li>
          </ul>
        </section>

        <section className="cta art">
          <div className="cta-card">
            <h2>Start using chronexa</h2>
            <p>Dates you can reason about: explicit zones, strict parsing, no surprises.</p>
            <div className="hero-actions">
              <a className="btn btn-brand" href={docHref("getting-started")}>
                Get Started
              </a>
              <a className="btn" href="#playground">
                Open the playground
              </a>
            </div>
          </div>
        </section>
      </div>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Logo />
            <p>{PKG.description}</p>
          </div>
          <div>
            <h3>Docs</h3>
            <a href={docHref("getting-started")}>Getting Started</a>
            <a href={docHref("datetime")}>DateTime</a>
            <a href={docHref("timezones")}>Time zones</a>
            <a href={docHref("business-recurrence")}>Business days & recurrence</a>
            <a href={docHref("errors")}>Errors & TypeScript</a>
          </div>
          <div>
            <h3>Resources</h3>
            <a href={REPO} target="_blank" rel="noreferrer">
              <GitHubIcon width={14} height={14} /> GitHub
            </a>
            <a href={NPM_URL} target="_blank" rel="noreferrer">
              npm
            </a>
            <a href={CHANGELOG_URL} target="_blank" rel="noreferrer">
              Changelog
            </a>
            <a href={`${REPO}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer">
              Contributing
            </a>
          </div>
          <div>
            <h3>M2Toolkit</h3>
            <a href={M2TOOLKIT}>Home</a>
            <a href={`${M2TOOLKIT}/tools`}>Free tools</a>
            <a href={PACKAGES_URL}>npm packages</a>
            <a href={`${M2TOOLKIT}/about`}>About</a>
          </div>
        </div>
        <p className="footer-bottom">
          Released under the {PKG.license} License. © 2026 Mohsin Zia. Hosted on{" "}
          <a href={PACKAGES_URL}>m2toolkit.com/npm-packages</a>.
        </p>
      </footer>
    </main>
  );
}
