# UC Homepage Accessibility Report

A monthly automated accessibility report for the 11 University of California
system homepages, inspired by the [WebAIM Million](https://webaim.org/projects/million/)
project.

**Live report:** [https://rlorenzo.github.io/uc-homepage-a11y-report/](https://rlorenzo.github.io/uc-homepage-a11y-report/)

## What this does

On the first of every month a GitHub Actions workflow loads each UC homepage
in headless Chromium, runs [axe-core](https://github.com/dequelabs/axe-core)
against it, and records the results. The report site is rebuilt and deployed
to GitHub Pages so that month-over-month trends are visible at a glance.

## Sites scanned

| Campus | URL |
|---|---|
| UC Office of the President | https://www.ucop.edu |
| UC Berkeley | https://www.berkeley.edu |
| UCLA | https://www.ucla.edu |
| UC San Diego | https://ucsd.edu |
| UC Davis | https://www.ucdavis.edu |
| UC Irvine | https://uci.edu |
| UC Santa Barbara | https://www.ucsb.edu |
| UC Santa Cruz | https://www.ucsc.edu |
| UC Riverside | https://www.ucr.edu |
| UC Merced | https://www.ucmerced.edu |
| UC San Francisco | https://www.ucsf.edu |

## Running locally

Requires **Node.js 24 or later**.

```bash
npm ci
npx playwright install chromium
node scan/run.mjs
```

The scan takes a few minutes. Results are written to `data/runs/YYYY-MM/` and
`data/history.json`. To view the report, serve the `site/` directory with any
static server:

```bash
npx serve site
```

Then open the URL printed in the terminal. The report loads `data/history.json`
at runtime, so you will also need to copy (or symlink) that file into the site
directory:

```bash
mkdir -p site/data
cp data/history.json site/data/history.json
```

## Adding or removing a site

Edit `scan/sites.json`. Each entry needs a `slug` (short identifier used in
file names and history keys), a `name` (displayed in the report), and a `url`.
No code changes required.

## How the monthly automation works

The GitHub Actions workflow (`.github/workflows/monthly-scan.yml`) is triggered
by a cron schedule (`0 14 1 * *`, i.e. 14:00 UTC on the 1st) and also supports
manual dispatch via `workflow_dispatch`. It:

1. Checks out the repo.
2. Installs Node.js 24, npm dependencies, and Chromium.
3. Runs `node scan/run.mjs` to scan all sites.
4. Commits any new data under `data/` with the message "Monthly scan YYYY-MM".
5. Deploys the `site/` directory (with `data/history.json` copied in) to
   GitHub Pages.

If the workflow is manually re-triggered for a month that has already been
scanned, the existing rows for that month are replaced (not duplicated) in
`history.json`.

## Limitations

Automated accessibility scanning with axe-core typically detects only 30 to 40
percent of real accessibility issues. This report provides a useful lower bound,
but it is not a substitute for manual testing, assistive technology evaluation,
or testing with users who have disabilities.

## License

MIT
