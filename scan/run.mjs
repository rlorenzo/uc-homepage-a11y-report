import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { updateHistory } from "./update-history.mjs";
import { RULE_DESCRIPTIONS } from "../site/assets/data/constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Determine the current month string (YYYY-MM) and ISO timestamp.
// Use UTC so runs near a month boundary land in the same folder regardless
// of the runner's local timezone, and match the workflow's UTC commit message.
const now = new Date();
const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
const scannedAt = now.toISOString();

let sites = JSON.parse(await readFile(join(__dirname, "sites.json"), "utf-8"));

// Optional filter flags for selective re-scans / local iteration.
// Values match the raw sites.json fields, not the UI's plural chip
// labels: type accepts homepage, admissions, school, division.
//   --type=homepage,admissions    Only scan sites matching these types.
//   --campus=berkeley,ucla        Only scan sites on these campuses.
//   --slug=berkeley-haas          Only scan specific sites by slug.
// All three accept comma-separated lists and combine with AND.
const filters = { type: null, campus: null, slug: null };
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--(type|campus|slug)=(.+)$/);
  if (m)
    filters[m[1]] = new Set(
      m[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
}
if (filters.type) sites = sites.filter((s) => filters.type.has(s.type));
if (filters.campus) sites = sites.filter((s) => filters.campus.has(s.campus));
if (filters.slug) sites = sites.filter((s) => filters.slug.has(s.slug));
const appliedFilters = Object.entries(filters)
  .filter(([, v]) => v)
  .map(([k, v]) => `--${k}=${[...v].join(",")}`)
  .join(" ");
if (appliedFilters) console.log(`Filter applied: ${appliedFilters}`);
if (sites.length === 0) {
  console.error("No sites match the provided filters. Exiting.");
  process.exit(1);
}

const runsDir = join(ROOT, "data", "runs", month);
await mkdir(runsDir, { recursive: true });

// Resolve the axe-core version so we can record it alongside every result.
// The version lives in the axe-core package that @axe-core/playwright depends on.
const axePkg = JSON.parse(
  await readFile(join(ROOT, "node_modules", "axe-core", "package.json"), "utf-8"),
);
const axeVersion = axePkg.version;

console.log(`Starting scan for ${month} (axe-core ${axeVersion})`);
console.log(`Scanning ${sites.length} sites\n`);

// If the environment defines an HTTP(S) proxy, tell Chromium to use it.
// Playwright does not inherit proxy env vars automatically.
const proxyUrl =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

// Hide the headless automation marker so Cloudflare-protected sites
// (e.g. www.vetmed.ucdavis.edu) don't reflexively serve a 403 challenge
// page. Real Chrome doesn't expose this flag, so the absence is what
// the bot detector keys on.
const launchOptions = {
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
};
if (proxyUrl) {
  try {
    const parsed = new URL(proxyUrl);
    const server = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
    launchOptions.proxy = { server };
    if (parsed.username) launchOptions.proxy.username = decodeURIComponent(parsed.username);
    if (parsed.password) launchOptions.proxy.password = decodeURIComponent(parsed.password);
    console.log(`Using proxy: ${server}\n`);
  } catch {
    console.log("Could not parse proxy URL, proceeding without proxy.\n");
  }
}

// Reuse a single browser instance for efficiency, but create a fresh
// context per site so cookies and storage do not leak between sites.
const browser = await chromium.launch(launchOptions);

const CONCURRENCY = 5;

// Some UC sites (e.g. uci.edu via AWS ELB) return 403 to the default
// Playwright "HeadlessChrome" user agent. Use a realistic desktop Chrome UA
// to avoid tripping these user-agent-based bot filters. Fetch the latest
// from jnrbsn/user-agents (updated daily) so it stays fresh as Chrome's
// major version bumps, and fall back to a pinned string if the fetch fails.
const FALLBACK_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

async function resolveUserAgent() {
  // Abort after 5s so a hung CDN can't stall the whole scan.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch("https://jnrbsn.github.io/user-agents/user-agents.json", {
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const list = await resp.json();
    // Pick the macOS Chrome entry with the highest major version. The list
    // is not guaranteed to be sorted, so parse and compare explicitly.
    const candidates = list
      .filter((ua) => ua.includes("Macintosh") && ua.includes("Chrome/") && !ua.includes("Edg/"))
      .map((ua) => ({ ua, version: Number((ua.match(/Chrome\/(\d+)/) || [])[1] || 0) }))
      .sort((a, b) => b.version - a.version);
    if (candidates.length) return candidates[0].ua;
  } catch (err) {
    console.log(`Could not fetch latest user agents (${err.message}), using fallback.`);
  } finally {
    clearTimeout(timer);
  }
  return FALLBACK_USER_AGENT;
}

const USER_AGENT = await resolveUserAgent();
console.log(`Using user agent: ${USER_AGENT}\n`);

async function scanSite(site) {
  console.log(`Scanning ${site.name} (${site.url}) ...`);
  // Context/page creation is inside the try so that failures in
  // newContext()/newPage() (e.g. bad proxy, browser crash) are handled as
  // per-site errors rather than aborting the whole run.
  let context;
  try {
    // Start at a mobile viewport. Many UC homepages use Foundation's
    // ResponsiveMenu, which swaps between AccordionMenu (narrow) and
    // DropdownMenu (medium+). Foundation's AccordionMenu._init() adds
    // aria-multiselectable="true" to its root element; when the viewport
    // later widens past the breakpoint, ResponsiveMenu hands the element
    // off to DropdownMenu but does NOT strip the attribute. The result:
    // a role="menubar" with a prohibited aria-multiselectable, which
    // cascades into aria-allowed-attr + aria-required-children +
    // aria-required-parent failures for every menuitem inside. A desktop-
    // only scan misses this entirely because AccordionMenu never runs.
    // Loading at 375×800 first lets AccordionMenu initialize; resizing
    // to 1440×900 then triggers the real-world transition bug.
    context = await browser.newContext({
      ignoreHTTPSErrors: Boolean(proxyUrl),
      userAgent: USER_AGENT,
      viewport: { width: 375, height: 800 },
    });
    const page = await context.newPage();

    // networkidle waits until there are no more than 0 network connections
    // for at least 500ms. This gives JS-heavy homepages time to finish
    // rendering before we count elements and run axe. Some sites (e.g. UCSD)
    // keep persistent connections open (analytics, websockets), so networkidle
    // never resolves. In that case we fall back to the "load" event, which
    // fires once the page and its subresources have finished loading.
    let response;
    try {
      response = await page.goto(site.url, { waitUntil: "networkidle", timeout: 30_000 });
    } catch (navError) {
      if (navError.name === "TimeoutError") {
        console.log(`  [${site.slug}] networkidle timed out, retrying with waitUntil: load ...`);
        response = await page.goto(site.url, { waitUntil: "load", timeout: 30_000 });
      } else {
        throw navError;
      }
    }

    if (!response?.ok()) {
      const status = response ? response.status() : "no response";
      throw new Error(`HTTP ${status} from ${site.url}`);
    }

    // Let mobile-mode JS (AccordionMenu, mobile nav, etc.) finish wiring up.
    await page.waitForTimeout(1500);

    // Resize to a desktop viewport. This triggers ResponsiveMenu's
    // breakpoint-crossing logic and exposes any stranded mobile-state
    // attributes on the now-desktop DOM.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(1500);

    // Many UC homepages use scroll-triggered reveal animations
    // (IntersectionObserver, AOS, GSAP, etc.) where text starts in an
    // "invisible" state — often with color matched to the background —
    // and animates to its final color when the element enters the
    // viewport. In a headless scan that never scrolls, those elements
    // are frozen in their pre-animation state when axe-core inspects
    // them, producing 1.01:1 contrast false positives on every headline
    // below the fold. Scrolling the full document height fires any
    // IntersectionObserver callbacks, then we scroll back and wait for
    // animations and lazy-init JS (e.g. Slick carousels on ucsf.edu) to
    // settle before running axe. Two seconds is generous enough to give
    // stable month-over-month numbers on JS-heavy homepages.
    await page.evaluate(async () => {
      const step = 400;
      const delay = 40;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, delay));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2000);

    const elementCount = await page.locator("*").count();

    // Run axe with every WCAG 2.0/2.1/2.2 tag. We bucket the results
    // ourselves below into "required" (legally mandated — WCAG 2.0 and
    // 2.1 Level A/AA, the baseline under ADA Title II / Section 508)
    // and "reach" (everything else: WCAG 2.0/2.1 AAA and all of WCAG
    // 2.2). WCAG 2.2 — including SC 2.5.8 target-size at 24×24 — is
    // not yet legally mandated in the US, so it's treated as a reach
    // goal. Legacy mode is enabled because many UC homepages embed
    // cross-origin iframes whose documents are inaccessible to axe,
    // causing "Cannot read properties of null" errors in flattenTree.
    const axeResults = await new AxeBuilder({ page })
      .withTags([
        "wcag2a",
        "wcag2aa",
        "wcag2aaa",
        "wcag21a",
        "wcag21aa",
        "wcag21aaa",
        "wcag22a",
        "wcag22aa",
        "wcag22aaa",
      ])
      .setLegacyMode(true)
      .analyze();

    // Bucket each violation into "required" vs "reach" by inspecting
    // its WCAG tags. Required = 2.0/2.1 A/AA. Everything else is reach.
    const REQUIRED_TAGS = new Set(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
    function bucketFor(tags) {
      for (const t of tags || []) {
        if (REQUIRED_TAGS.has(t)) return "required";
      }
      return "reach";
    }

    function emptyCounters() {
      return {
        total: 0,
        by_impact: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
        by_rule: {},
        // axe assigns one impact level per rule, so we can store a plain
        // rule → impact map alongside the counts. The report uses this
        // to tag each rule in the per-site detail rows.
        by_rule_impact: {},
      };
    }

    const required = emptyCounters();
    const reach = emptyCounters();

    for (const v of axeResults.violations) {
      const bucket = bucketFor(v.tags) === "required" ? required : reach;
      const count = v.nodes.length;
      const impact = v.impact || "unknown";
      bucket.total += count;
      bucket.by_impact[impact] = (bucket.by_impact[impact] || 0) + count;
      bucket.by_rule[v.id] = (bucket.by_rule[v.id] || 0) + count;
      bucket.by_rule_impact[v.id] = impact;
    }

    // Error density is calculated against REQUIRED violations only —
    // the headline "how dense are the legal-baseline issues?" question.
    const errorDensity =
      elementCount > 0 ? Math.round((required.total / elementCount) * 10000) / 10000 : 0;

    // Write the full axe output for archival.
    const fullResult = {
      month,
      scanned_at: scannedAt,
      axe_version: axeVersion,
      site: site.slug,
      name: site.name,
      campus: site.campus,
      type: site.type,
      category: site.category,
      url: site.url,
      element_count: elementCount,
      violations: axeResults.violations,
      incomplete: axeResults.incomplete,
    };

    await writeFile(join(runsDir, `${site.slug}.json`), JSON.stringify(fullResult, null, 2));

    console.log(
      `  [${site.slug}] OK: ${required.total} required + ${reach.total} reach, ${elementCount} elements`,
    );

    return {
      month,
      scanned_at: scannedAt,
      axe_version: axeVersion,
      site: site.slug,
      name: site.name,
      campus: site.campus,
      type: site.type,
      category: site.category,
      url: site.url,
      status: "ok",
      element_count: elementCount,
      // Headline "violations_*" fields reflect REQUIRED issues only —
      // this is the legal baseline the report centers. Old consumers
      // that read these fields continue to work unchanged.
      violations_total: required.total,
      violations_by_impact: required.by_impact,
      violations_by_rule: required.by_rule,
      violations_rule_impact: required.by_rule_impact,
      // Separate reach-goal bucket for aspirational tracking.
      reach_violations_total: reach.total,
      reach_violations_by_impact: reach.by_impact,
      reach_violations_by_rule: reach.by_rule,
      reach_violations_rule_impact: reach.by_rule_impact,
      error_density: errorDensity,
    };
  } catch (err) {
    // A failure on one site must not abort the entire run. Record the
    // error so the report can display "scan failed" for this site.
    console.error(`  [${site.slug}] ERROR: ${err.message}`);

    const errorResult = {
      month,
      scanned_at: scannedAt,
      axe_version: axeVersion,
      site: site.slug,
      name: site.name,
      campus: site.campus,
      type: site.type,
      category: site.category,
      url: site.url,
      status: "error",
      error: err.message,
    };

    await writeFile(join(runsDir, `${site.slug}.json`), JSON.stringify(errorResult, null, 2));

    return {
      ...errorResult,
      element_count: 0,
      violations_total: 0,
      violations_by_impact: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
      violations_by_rule: {},
      violations_rule_impact: {},
      reach_violations_total: 0,
      reach_violations_by_impact: { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 },
      reach_violations_by_rule: {},
      reach_violations_rule_impact: {},
      error_density: 0,
    };
  } finally {
    if (context) await context.close();
  }
}

// Process sites with limited concurrency to avoid overwhelming the runner.
const results = [];
const queue = [...sites];

async function worker() {
  while (queue.length) {
    const site = queue.shift();
    results.push(await scanSite(site));
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

await browser.close();

// Append (or replace) this month's rows in history.json.
await updateHistory(results);

// Warn about violation rules that have no friendly description in the report.
const seenRules = new Set(
  results.flatMap((r) => [
    ...Object.keys(r.violations_by_rule || {}),
    ...Object.keys(r.reach_violations_by_rule || {}),
  ]),
);
const uncovered = [...seenRules].filter((id) => !RULE_DESCRIPTIONS[id]).sort();
if (uncovered.length) {
  console.warn(`\n⚠  ${uncovered.length} violation rule(s) missing from RULE_DESCRIPTIONS:`);
  for (const id of uncovered) console.warn(`   - ${id}`);
  console.warn("   Add descriptions in site/assets/data/constants.js\n");
}

console.log("Scan complete.");
