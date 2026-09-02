import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
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
// labels: type accepts homepage, admissions, school, division, library,
// it, disability, registrar, financial-aid, health, and housing.
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
// Resolve it THROUGH @axe-core/playwright rather than reading
// node_modules/axe-core directly. pa11y-ci pulls its own axe-core, and when the
// two want different versions npm hoists one copy to the top level and nests
// the other — so the top-level copy can be a version the scan never ran.
// axe_version is the field that explains trend discontinuities, so a wrong
// value there is worse than no value.
const axeRequire = createRequire(createRequire(import.meta.url).resolve("@axe-core/playwright"));
const axeVersion = axeRequire("axe-core/package.json").version;

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
//
// Some bot-managed sites go further and deny *headless* Chrome on its
// fingerprint alone — regardless of source IP or a spoofed UA. Akamai on
// ucmerced.edu is the clearest case: every ucmerced.edu host 403s a headless
// browser but serves a real, headed Chrome fine. Rather than run the whole
// fleet headed (heavier, and it would shift the month-over-month baseline for
// the ~170 sites that scan fine headless), the fleet stays headless and any
// site that comes back blocked is retried once on a real headed browser — see
// the headed-fallback logic in scanSite(). Set SCAN_NO_HEADED_FALLBACK=1 to
// turn that off; SCAN_HEADED_CHANNEL overrides the headed browser channel
// (default "chrome"; use e.g. "msedge" if Chrome isn't the installed browser).
const HEADED_CHANNEL = process.env.SCAN_HEADED_CHANNEL || "chrome";
const HEADED_FALLBACK = !/^(1|true|yes)$/i.test(process.env.SCAN_NO_HEADED_FALLBACK || "");
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

// Reuse a single headless browser for efficiency, but create a fresh context
// per site so cookies and storage do not leak between sites. This is the
// baseline every site is scanned with first.
const browser = await chromium.launch(launchOptions);

// A real, headed browser, launched lazily (at most once, on first need) and
// used only to retry sites a headless scan can't reach because of bot
// detection. A run with no blocked sites never launches it, so the common
// case pays nothing. The singleton promise also means concurrent workers that
// all hit a block share one browser instead of each launching their own.
let headedBrowserPromise = null;
function getHeadedBrowser() {
  if (!headedBrowserPromise) {
    console.log(`  Launching headed ${HEADED_CHANNEL} browser for bot-blocked retries ...`);
    headedBrowserPromise = chromium.launch({
      headless: false,
      channel: HEADED_CHANNEL,
      args: ["--disable-blink-features=AutomationControlled"],
      // The headed retry must reach the network the same way the fleet does,
      // so it inherits the fleet's proxy when one is configured.
      ...(launchOptions.proxy ? { proxy: launchOptions.proxy } : {}),
    });
    // A failed launch must not stick: clear the slot so a later blocked site
    // attempts a fresh launch instead of inheriting the cached rejection.
    headedBrowserPromise.catch(() => {
      headedBrowserPromise = null;
    });
  }
  return headedBrowserPromise;
}

// HTTP statuses that typically signal a bot/WAF block rather than a genuine
// error. A block is worth one retry on the headed browser; a real 404/500 is
// not (headed Chrome wouldn't change the outcome).
const BLOCK_STATUSES = new Set([401, 403, 406, 429, 503]);

const CONCURRENCY = Number(process.env.SCAN_CONCURRENCY) || 5;

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

// UC Merced sanctioned this scan by allowlisting a bot User-Agent in their bot
// manager (they match the "UC-A11Y-Report-Bot/1.0" token) — the scan runs on
// GitHub Actions and has no stable IP to allowlist. We send that exact UA for
// identified campuses' *headless* (sanctioned) requests. The value comes from
// the SCAN_UA_TOKEN env var (a GitHub Actions secret) so it stays out of this
// public repo and is overridable, though the UA itself is a public identifier.
// When unset (local dev / forks) no override is applied and Merced falls through
// to the headed fallback. The headed fallback keeps the real Chrome UA — it
// clears bot detection on browser fingerprint, and a non-browser bot UA there
// would only work against it.
const SANCTIONED_UA = process.env.SCAN_UA_TOKEN || "";
const IDENTIFIED_CAMPUSES = new Set(["ucmerced"]);

// The UA to send for a given site/attempt: Merced's sanctioned bot UA for its
// headless requests (when configured), the real Chrome UA everywhere else.
function userAgentFor(site, mode) {
  if (mode === "headed") return USER_AGENT;
  if (SANCTIONED_UA && IDENTIFIED_CAMPUSES.has(site.campus)) return SANCTIONED_UA;
  return USER_AGENT;
}

// The axe tag set shared by both mobile and desktop passes. Every WCAG
// 2.0/2.1/2.2 tag runs; results bucket below into "required" (WCAG 2.0 and 2.1
// Level A/AA — the ADA Title II / Section 508 baseline) and "reach".
const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag2aaa",
  "wcag21a",
  "wcag21aa",
  "wcag21aaa",
  "wcag22a",
  "wcag22aa",
  "wcag22aaa",
];

// Required = WCAG 2.0/2.1 Level A/AA; everything else buckets as reach.
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
    // axe assigns one impact level per rule, so a plain rule → impact map
    // rides alongside the counts; the report tags each rule from it.
    by_rule_impact: {},
  };
}

// Flatten one counter set into the prefixed fields a result row exposes, so
// ok and error rows are built from a single definition of the shape
// (e.g. "violations" → violations_total, violations_by_impact,
// violations_by_rule, violations_rule_impact).
function counterFields(prefix, c) {
  return {
    [`${prefix}_total`]: c.total,
    [`${prefix}_by_impact`]: c.by_impact,
    [`${prefix}_by_rule`]: c.by_rule,
    [`${prefix}_rule_impact`]: c.by_rule_impact,
  };
}

// Fold one violation's node count into its bucket's running totals.
function addViolation(bucket, v) {
  const count = v.nodes.length;
  const impact = v.impact || "unknown";
  bucket.total += count;
  bucket.by_impact[impact] = (bucket.by_impact[impact] || 0) + count;
  bucket.by_rule[v.id] = (bucket.by_rule[v.id] || 0) + count;
  bucket.by_rule_impact[v.id] = impact;
}

// Split violations into "required" vs "reach" buckets with per-impact and
// per-rule counts.
function bucketViolations(violations) {
  const required = emptyCounters();
  const reach = emptyCounters();
  for (const v of violations) {
    addViolation(bucketFor(v.tags) === "required" ? required : reach, v);
  }
  return { required, reach };
}

// Error density is REQUIRED violations per element (4 dp) — the headline
// "how dense are the legal-baseline issues?" number.
function computeDensity(total, elementCount) {
  return elementCount > 0 ? Math.round((total / elementCount) * 10000) / 10000 : 0;
}

// Scroll the full page in increments (firing IntersectionObserver / scroll-
// reveal animations so lazy content is visible to axe), then scroll back up.
async function scrollFullPage(page) {
  await page.evaluate(async () => {
    const step = 400;
    const delay = 40;
    // Cap the total distance: scrollHeight is re-read every iteration, so a
    // page that lazy-appends content as it scrolls (infinite feed) would
    // otherwise grow the goalpost forever — and page.evaluate has no
    // timeout, so one such site would hang its worker until the workflow's
    // job timeout killed the entire run.
    const maxScroll = 30000;
    for (let y = 0; y < document.body.scrollHeight && y < maxScroll; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, delay));
    }
    window.scrollTo(0, 0);
  });
}

// Track in-flight requests so a navigation timeout can report *what* was still
// outstanding. Both waitUntil conditions the scan uses are gated by
// subresources — "load" waits on every blocking resource (script, stylesheet,
// image, font, iframe), and even "domcontentloaded" waits on parser-blocking
// scripts — so a single third-party host that accepts the connection and then
// never responds is enough to hang the whole navigation. A bare
// "Timeout 30000ms exceeded" says nothing about which host that was, which
// makes an intermittent, environment-specific stall (one that reproduces on
// the CI runner but not on a developer's machine) effectively undiagnosable
// after the fact. Recording the pending set at the moment of failure turns
// that into a one-line answer in the archived error record.
function trackPendingRequests(page) {
  const inflight = new Map();
  page.on("request", (r) =>
    inflight.set(r, { url: r.url(), type: r.resourceType(), startedAt: Date.now() }),
  );
  const settle = (r) => inflight.delete(r);
  page.on("requestfinished", settle);
  page.on("requestfailed", settle);
  // Longest-pending first: the request that has been hanging the longest is
  // almost always the one holding the navigation open.
  return () =>
    [...inflight.values()]
      .map(({ url, type, startedAt }) => ({ url, type, pending_ms: Date.now() - startedAt }))
      .sort((a, b) => b.pending_ms - a.pending_ms);
}

// On a navigation timeout, name the requests that were still hanging — the
// longest-pending one is the lead suspect. Capped so one pathological page
// can't flood the log.
function logPendingRequests(site, pending) {
  if (!pending.length) return;
  console.error(`  [${site.slug}] ${pending.length} request(s) in flight at timeout:`);
  for (const p of pending.slice(0, 15)) {
    console.error(`     ${(p.pending_ms / 1000).toFixed(1)}s [${p.type}] ${p.url}`);
  }
}

// The first attempt's per-navigation budget, and the wider budget the retry
// gets. Some origins silently drop a share of inbound connections rather than
// refusing them: measured from GitHub Actions, law.uci.edu hung 3 of 12 TCP
// handshakes for 30s+, spread across both of its A records and not confined to
// first contact, while the connections that did land completed in under 40ms.
// SYN retransmits were seen getting through at 18-22s, so the handshake
// usually does complete — just not inside a single 30s attempt. The loss is
// invisible from a developer machine, which makes a site look fine locally
// while failing in CI. Giving the retry room lets the handshake land instead
// of recording a site as unreachable when it is merely lossy to reach. Sites
// that connect immediately — the overwhelming majority — are unaffected, since
// the budget is a ceiling and not a delay.
const NAV_TIMEOUT_MS = 30_000;
const RETRY_NAV_TIMEOUT_MS = 60_000;

// Navigate with networkidle, falling back to the "load" event. Some sites
// (e.g. UCSD) keep persistent connections open so networkidle never settles;
// "load" fires once the page and subresources finish. Non-timeout nav errors
// propagate unchanged.
async function gotoWithFallback(page, site, timeout = NAV_TIMEOUT_MS) {
  try {
    return await page.goto(site.url, { waitUntil: "networkidle", timeout });
  } catch (navError) {
    if (navError.name !== "TimeoutError") throw navError;
    console.log(`  [${site.slug}] networkidle timed out, retrying with waitUntil: load ...`);
    return page.goto(site.url, { waitUntil: "load", timeout });
  }
}

// The HTTP status of a response, or 0 if there was none.
const statusOf = (response) => (response ? response.status() : 0);

// Throw a status-tagged error for a non-OK response so scanSite can decide
// whether a headed retry is warranted.
function assertOk(response, site) {
  if (response?.ok()) return;
  const status = statusOf(response);
  const err = new Error(`HTTP ${status || "no response"} from ${site.url}`);
  err.httpStatus = status;
  throw err;
}

// One-line per-site success log, tagging headed retries.
function logScanOk(site, mode, r) {
  const tag = mode === "headed" ? " (headed)" : "";
  console.log(
    `  [${site.slug}] OK${tag}: ${r.required.total} required + ${r.reach.total} reach (desktop), ` +
      `${r.mobileRequired.total} required + ${r.mobileReach.total} reach (mobile), ` +
      `${r.elementCount} elements`,
  );
}

// Scan one site with a specific browser (the headless fleet browser or the
// headed fallback). Returns the success summary and writes the full axe output
// to disk, or throws — the caller (scanSite) decides whether a thrown error is
// worth a retry. `mode` is "headless" | "headed", used for logging and the
// archived render_mode field. `navTimeout` is the per-navigation budget; the
// retry path widens it (see NAV_TIMEOUT_MS).
async function scanWith(site, browser, mode, navTimeout = NAV_TIMEOUT_MS) {
  // Context/page creation is inside the try so that failures in
  // newContext()/newPage() (e.g. bad proxy, browser crash) propagate to the
  // caller as a per-site error rather than aborting the whole run.
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
      userAgent: userAgentFor(site, mode),
      viewport: { width: 375, height: 800 },
    });
    const page = await context.newPage();
    const pendingRequests = trackPendingRequests(page);

    let response;
    try {
      response = await gotoWithFallback(page, site, navTimeout);
    } catch (navError) {
      // Snapshot the in-flight set before the context is torn down; the
      // finally block below closes it and the listeners go with it. Captured
      // for every navigation failure, not just Playwright's TimeoutError: a
      // stalled connection often surfaces as Chrome's own net::ERR_TIMED_OUT
      // instead, and that case needs the same diagnosis.
      navError.pendingRequests = pendingRequests();
      throw navError;
    }
    assertOk(response, site);

    // Let mobile-mode JS (AccordionMenu, mobile nav, etc.) finish wiring up.
    await page.waitForTimeout(1500);

    // ── Mobile pass ──────────────────────────────────────────────
    // Scroll at the mobile viewport (375×800) to trigger any
    // IntersectionObserver / scroll-reveal animations, then run axe at
    // the mobile width before we resize to desktop. This captures
    // accessibility issues unique to the narrow/touch layout.
    await scrollFullPage(page);
    await page.waitForTimeout(2000);

    const mobileRaw = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .setLegacyMode(true)
      .analyze();

    // ── Desktop pass ─────────────────────────────────────────────
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
    await scrollFullPage(page);
    await page.waitForTimeout(2000);

    const elementCount = await page.locator("*").count();

    // WCAG 2.2 — including SC 2.5.8 target-size at 24×24 — is not yet
    // legally mandated in the US, so it's treated as a reach goal.
    // Legacy mode is enabled because many UC homepages embed cross-
    // origin iframes whose documents are inaccessible to axe, causing
    // "Cannot read properties of null" errors in flattenTree.
    const desktopRaw = await new AxeBuilder({ page })
      .withTags(AXE_TAGS)
      .setLegacyMode(true)
      .analyze();

    // Bucket mobile and desktop violations (helpers hoisted to module scope).
    const { required: mobileRequired, reach: mobileReach } = bucketViolations(mobileRaw.violations);
    const { required, reach } = bucketViolations(desktopRaw.violations);

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
      render_mode: mode,
      element_count: elementCount,
      violations: desktopRaw.violations,
      incomplete: desktopRaw.incomplete,
      mobile_violations: mobileRaw.violations,
      mobile_incomplete: mobileRaw.incomplete,
    };

    await writeFile(join(runsDir, `${site.slug}.json`), JSON.stringify(fullResult, null, 2));

    logScanOk(site, mode, { required, reach, mobileRequired, mobileReach, elementCount });

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
      render_mode: mode,
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
      error_density: computeDensity(required.total, elementCount),
      // Mobile viewport results, mirroring the desktop structure.
      mobile_violations_total: mobileRequired.total,
      mobile_violations_by_impact: mobileRequired.by_impact,
      mobile_violations_by_rule: mobileRequired.by_rule,
      mobile_violations_rule_impact: mobileRequired.by_rule_impact,
      mobile_reach_violations_total: mobileReach.total,
      mobile_reach_violations_by_impact: mobileReach.by_impact,
      mobile_reach_violations_by_rule: mobileReach.by_rule,
      mobile_reach_violations_rule_impact: mobileReach.by_rule_impact,
    };
  } finally {
    if (context) await context.close();
  }
}

// Build (and archive) the error record for a site whose scan failed after all
// retries. Mirrors the success summary shape with zeroed counters so the report
// and updateHistory consume ok/error rows uniformly. `mode` is the render mode
// of the final attempt, matching the render_mode success rows record.
async function buildErrorResult(site, err, mode) {
  console.error(`  [${site.slug}] ERROR: ${err.message}`);

  const pending = err.pendingRequests || [];
  logPendingRequests(site, pending);

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
    render_mode: mode,
    error: err.message,
    ...(pending.length ? { pending_requests: pending.slice(0, 25) } : {}),
  };

  await writeFile(join(runsDir, `${site.slug}.json`), JSON.stringify(errorResult, null, 2));

  return {
    ...errorResult,
    element_count: 0,
    ...counterFields("violations", emptyCounters()),
    ...counterFields("reach_violations", emptyCounters()),
    error_density: 0,
    ...counterFields("mobile_violations", emptyCounters()),
    ...counterFields("mobile_reach_violations", emptyCounters()),
  };
}

// A thrown error worth a headed retry: the fallback is enabled and the status
// looks like a bot/WAF block rather than a genuine 404/500.
const isBlock = (err) => HEADED_FALLBACK && BLOCK_STATUSES.has(err.httpStatus);

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// A stalled navigation reaches us two different ways: Playwright raises its own
// TimeoutError when the waitUntil budget expires, but a connection that never
// completes its handshake often trips Chrome's network stack first and arrives
// as net::ERR_TIMED_OUT. Both are the same transient class — an origin that is
// slow to admit us rather than one that is genuinely down — so both earn the
// wider-budget retry. Treating only the former as retryable meant the harder
// failure got no second chance at all.
const isNavTimeout = (err) =>
  err.name === "TimeoutError" || /ERR_(CONNECTION_)?TIMED_OUT/.test(err.message || "");

// Run one scan attempt, converting any failure into an archived error record
// so a doomed retry never rejects out of the worker.
async function retryScan(site, browserForRetry, mode, navTimeout) {
  try {
    return await scanWith(site, browserForRetry, mode, navTimeout);
  } catch (err) {
    return buildErrorResult(site, err, mode);
  }
}

// Retry a bot-blocked site on the headed browser. A headed-launch failure
// (channel not installed, no display) is an infra problem, not a site problem:
// record the site's original block error rather than rejecting out of the
// worker and killing the run.
async function retryBlockedOnHeaded(site, err) {
  console.log(`  [${site.slug}] blocked (HTTP ${err.httpStatus}); retrying on headed ...`);
  let headed;
  try {
    headed = await getHeadedBrowser();
  } catch (launchErr) {
    console.error(`  Headed ${HEADED_CHANNEL} launch failed: ${launchErr.message}`);
    return buildErrorResult(site, err, "headless");
  }
  return retryScan(site, headed, "headed");
}

// Orchestrate one site: scan headless first, then apply targeted retries.
//  • Bot-block (403 etc.)  → retry once on a real headed browser, whose genuine
//    fingerprint clears Akamai/Cloudflare bot detection (e.g. all ucmerced.edu).
//  • Transient nav timeout → retry once more on the headless fleet browser,
//    with a wider navigation budget so an origin that drops connections
//    intermittently (e.g. law.uci.edu) gets the handshake it needs rather than
//    being recorded as unreachable.
// Anything still failing after its one retry is recorded as an error.
async function scanSite(site) {
  console.log(`Scanning ${site.name} (${site.url}) ...`);
  try {
    return await scanWith(site, browser, "headless");
  } catch (err) {
    if (isBlock(err)) return retryBlockedOnHeaded(site, err);
    if (isNavTimeout(err)) {
      const seconds = RETRY_NAV_TIMEOUT_MS / 1000;
      console.log(`  [${site.slug}] navigation timed out; retrying once at ${seconds}s ...`);
      await pause(2000);
      return retryScan(site, browser, "headless", RETRY_NAV_TIMEOUT_MS);
    }
    return buildErrorResult(site, err, "headless");
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
// Close the headed fallback browser too, but only if a blocked site actually
// triggered its launch.
if (headedBrowserPromise) {
  const headed = await headedBrowserPromise.catch(() => null);
  if (headed) await headed.close();
}

// Append (or replace) this month's rows in history.json.
await updateHistory(results);

// Warn about violation rules that have no friendly description in the report.
const keysOf = (obj) => Object.keys(obj || {});
const ruleKeys = (r) => [
  ...keysOf(r.violations_by_rule),
  ...keysOf(r.reach_violations_by_rule),
  ...keysOf(r.mobile_violations_by_rule),
  ...keysOf(r.mobile_reach_violations_by_rule),
];
const seenRules = new Set(results.flatMap(ruleKeys));
const uncovered = [...seenRules].filter((id) => !RULE_DESCRIPTIONS[id]).sort();
if (uncovered.length) {
  console.warn(`\n⚠  ${uncovered.length} violation rule(s) missing from RULE_DESCRIPTIONS:`);
  for (const id of uncovered) console.warn(`   - ${id}`);
  console.warn("   Add descriptions in site/assets/data/constants.js\n");
}

console.log("Scan complete.");
