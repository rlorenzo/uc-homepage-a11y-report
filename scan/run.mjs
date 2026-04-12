import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { updateHistory } from './update-history.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Determine the current month string (YYYY-MM) and ISO timestamp.
const now = new Date();
const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const scannedAt = now.toISOString();

const sites = JSON.parse(await readFile(join(__dirname, 'sites.json'), 'utf-8'));
const runsDir = join(ROOT, 'data', 'runs', month);
await mkdir(runsDir, { recursive: true });

// Resolve the axe-core version so we can record it alongside every result.
// The version lives in the axe-core package that @axe-core/playwright depends on.
const axePkg = JSON.parse(
  await readFile(
    join(ROOT, 'node_modules', 'axe-core', 'package.json'),
    'utf-8'
  )
);
const axeVersion = axePkg.version;

console.log(`Starting scan for ${month} (axe-core ${axeVersion})`);
console.log(`Scanning ${sites.length} sites\n`);

// If the environment defines an HTTP(S) proxy, tell Chromium to use it.
// Playwright does not inherit proxy env vars automatically.
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
  || process.env.HTTP_PROXY || process.env.http_proxy;

const launchOptions = { headless: true };
if (proxyUrl) {
  try {
    const parsed = new URL(proxyUrl);
    const server = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
    launchOptions.proxy = { server };
    if (parsed.username) launchOptions.proxy.username = decodeURIComponent(parsed.username);
    if (parsed.password) launchOptions.proxy.password = decodeURIComponent(parsed.password);
    console.log(`Using proxy: ${server}\n`);
  } catch {
    console.log('Could not parse proxy URL, proceeding without proxy.\n');
  }
}

// Reuse a single browser instance for efficiency, but create a fresh
// context per site so cookies and storage do not leak between sites.
const browser = await chromium.launch(launchOptions);

const CONCURRENCY = 3;

async function scanSite(site) {
  console.log(`Scanning ${site.name} (${site.url}) ...`);
  // ignoreHTTPSErrors is needed when running behind a TLS-intercepting proxy
  // (common in CI containers). In normal environments it has no effect.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    // networkidle waits until there are no more than 0 network connections
    // for at least 500ms. This gives JS-heavy homepages time to finish
    // rendering before we count elements and run axe. Some sites (e.g. UCSD)
    // keep persistent connections open (analytics, websockets), so networkidle
    // never resolves. In that case we fall back to the "load" event, which
    // fires once the page and its subresources have finished loading.
    let response;
    try {
      response = await page.goto(site.url, { waitUntil: 'networkidle', timeout: 30_000 });
    } catch (navError) {
      if (navError.name === 'TimeoutError') {
        console.log(`  [${site.slug}] networkidle timed out, retrying with waitUntil: load ...`);
        response = await page.goto(site.url, { waitUntil: 'load', timeout: 30_000 });
      } else {
        throw navError;
      }
    }

    if (!response || !response.ok()) {
      const status = response ? response.status() : 'no response';
      throw new Error(`HTTP ${status} from ${site.url}`);
    }

    const elementCount = await page.locator('*').count();

    // Run axe with WCAG 2.x A/AA tags only. These correspond to the
    // standards most commonly referenced in higher-education policy.
    // Legacy mode is enabled because many UC homepages embed cross-origin
    // iframes whose documents are inaccessible to axe, causing
    // "Cannot read properties of null" errors in flattenTree.
    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .setLegacyMode(true)
      .analyze();

    // Count violations by impact level.
    const violationsByImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const violationsByRule = {};
    let violationsTotal = 0;

    for (const v of axeResults.violations) {
      const count = v.nodes.length;
      violationsTotal += count;
      violationsByImpact[v.impact] = (violationsByImpact[v.impact] || 0) + count;
      violationsByRule[v.id] = (violationsByRule[v.id] || 0) + count;
    }

    const errorDensity = elementCount > 0
      ? Math.round((violationsTotal / elementCount) * 10000) / 10000
      : 0;

    // Write the full axe output for archival.
    const fullResult = {
      month,
      scanned_at: scannedAt,
      axe_version: axeVersion,
      site: site.slug,
      url: site.url,
      element_count: elementCount,
      violations: axeResults.violations,
      passes: axeResults.passes,
      incomplete: axeResults.incomplete,
      inapplicable: axeResults.inapplicable
    };

    await writeFile(
      join(runsDir, `${site.slug}.json`),
      JSON.stringify(fullResult, null, 2)
    );

    console.log(`  [${site.slug}] OK: ${violationsTotal} violations, ${elementCount} elements`);

    return {
      month,
      scanned_at: scannedAt,
      axe_version: axeVersion,
      site: site.slug,
      url: site.url,
      status: 'ok',
      element_count: elementCount,
      violations_total: violationsTotal,
      violations_by_impact: violationsByImpact,
      violations_by_rule: violationsByRule,
      error_density: errorDensity
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
      url: site.url,
      status: 'error',
      error: err.message
    };

    await writeFile(
      join(runsDir, `${site.slug}.json`),
      JSON.stringify(errorResult, null, 2)
    );

    return {
      ...errorResult,
      element_count: 0,
      violations_total: 0,
      violations_by_impact: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      violations_by_rule: {},
      error_density: 0
    };
  } finally {
    await context.close();
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

console.log('Scan complete.');
