# UC Web Accessibility Report

A monthly automated accessibility report covering 183 University of California
web properties — campus homepages, admissions sites, schools and colleges, and
key student services (libraries, IT, disability offices, registrars, financial
aid, student health, and housing) across all 10 UC campuses and the Office of
the President. Inspired by the
[WebAIM Million](https://webaim.org/projects/million/) project.

**Live report:** [https://rlorenzo.github.io/uc-homepage-a11y-report/](https://rlorenzo.github.io/uc-homepage-a11y-report/)

## What this does

On the first of every month a GitHub Actions workflow loads each UC web
property in headless Chromium, runs [axe-core](https://github.com/dequelabs/axe-core)
against it, and records the results. The report site is rebuilt and deployed
to GitHub Pages so that month-over-month trends are visible at a glance.

Violations are bucketed into two groups:

- **Required** — WCAG 2.0 and 2.1 Level A & AA rules. The baseline under ADA
  Title II and Section 508.
- **Reach** — WCAG 2.1 AAA and all of WCAG 2.2. Tracked separately as
  aspirational goals, not yet legally required in the US.

## Sites scanned

The report covers 183 UC web properties:

- **11 campus homepages** — one per UC campus and the Office of the President.
- **10 admissions sites** — one per campus. UCOP has no admissions page;
  UCSF uses its Graduate Division admissions page.
- **91 schools, colleges, and graduate divisions** — grouped by discipline
  (business, engineering, law, medicine & health, humanities & arts,
  social sciences, natural sciences, education, environment & design,
  information & journalism).
- **71 student services sites** — libraries, IT departments, disability
  offices, registrars, financial aid, student health centers, and student
  housing, one per campus for each category. The IT category also includes
  UCOP.

The full list with URLs lives in [`scan/sites.json`](scan/sites.json). Use
the filter bar at the top of the live report to view any slice (by campus,
by type, or by discipline).

## Running locally

Requires **Node.js 24 or later**.

```bash
npm ci
npx playwright install chromium
node scan/run.mjs
```

A full scan takes 10 to 12 minutes on a fast connection. Results are written
to `data/runs/YYYY-MM/<slug>.json` (one file per site, full axe output) and
appended to `data/history.json` (compact per-month summaries that the report
site reads).

To view the report, serve the `site/` directory with any static server:

```bash
npx serve site
```

The report loads `data/history.json` at runtime. The repo ships with a
`site/data` symlink to `../data`, so most static servers resolve it
automatically.

### Re-scanning a single site

The most common local workflow is re-running one site after fixing a bug
on it or investigating a weird result. Pass its slug to `--slug`:

```bash
node scan/run.mjs --slug=ucdavis-education
```

This overwrites only `data/runs/YYYY-MM/ucdavis-education.json` and replaces
only that one row in `history.json` — every other site's results for the
month are left untouched. Slugs match the `slug` field in
[`scan/sites.json`](scan/sites.json).

### Scanning other subsets

The same filter flags combine with AND for larger selections:

```bash
# Multiple specific sites
node scan/run.mjs --slug=berkeley-haas,ucla-anderson

# Just UCLA sites
node scan/run.mjs --campus=ucla

# All 11 homepages
node scan/run.mjs --type=homepage

# All admissions sites on Berkeley and UCLA
node scan/run.mjs --type=admissions --campus=berkeley,ucla
```

`--type` accepts `homepage`, `admissions`, `school`, `division`, `library`,
`it`, `disability`, `registrar`, `financial-aid`, `health`, or `housing` —
these match the raw `type` field in `scan/sites.json`, not the plural chip
labels in the report UI. All three flags accept comma-separated lists.

Filtered runs write into the same `data/runs/YYYY-MM/` folder and replace
only the matching rows in `history.json` — other rows for that month are
left untouched.

## Adding or removing a site

Edit [`scan/sites.json`](scan/sites.json). Each entry needs:

| Field | Description |
|---|---|
| `slug` | Short identifier used in file names and history keys. Must be unique. |
| `name` | Display name shown in the report. |
| `campus` | One of `berkeley`, `ucla`, `ucsd`, `ucdavis`, `uci`, `ucsb`, `ucsc`, `ucr`, `ucmerced`, `ucsf`, `ucop`. |
| `url` | The page to scan. |
| `type` | `homepage`, `admissions`, `school`, `division`, `library`, `it`, `disability`, `registrar`, `financial-aid`, `health`, or `housing`. Controls which View chip the site appears under. |
| `category` | `homepage`, `admissions`, a discipline slug (`business`, `engineering`, `law`, `medicine-health`, `humanities-arts`, `social-sciences`, `natural-sciences`, `education`, `environment-design`, `information`), or a student-services slug matching the `type` (`library`, `it`, `disability`, `registrar`, `financial-aid`, `health`, `housing`). Controls the Discipline dropdown (discipline slugs only). |

No code changes required — new entries are picked up on the next scan.

## How the monthly automation works

The GitHub Actions workflow (`.github/workflows/monthly-scan.yml`) is triggered
by a cron schedule (`0 14 1 * *`, 14:00 UTC on the 1st) and also supports
manual dispatch via `workflow_dispatch`. It:

1. Checks out `main` at runtime (not the trigger SHA — protects against
   stale reruns).
2. Installs Node.js 24, npm dependencies, and Chromium.
3. Runs `node scan/run.mjs` to scan all sites.
4. Commits any new data under `data/` with the message "Monthly scan YYYY-MM",
   rebasing onto `origin/main` first to handle concurrent pushes.
5. Deploys the `site/` directory — with `data/history.json` copied into
   `site/data/` — to GitHub Pages.

If the workflow is manually re-triggered for a month that has already been
scanned, the existing rows for that (month, site) pair are replaced rather
than duplicated.

## Verifying scan drift

If a site's numbers change between consecutive scans and you want to know
whether it's a real site change or a scan-method artifact, run:

```bash
npm run verify
```

This scans every site twice — once with the old desktop-only viewport and
once with the mobile → desktop transition the production scanner uses — and
prints a per-site diff. It does not write to `data/`.

## Limitations

Automated accessibility scanning with axe-core typically detects only 30 to 40
percent of real accessibility issues. This report provides a useful lower
bound, but it is not a substitute for manual testing, assistive technology
evaluation, or testing with users who have disabilities.

## License

MIT
