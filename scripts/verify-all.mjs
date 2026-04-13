// Verification tool: scan every UC homepage with both the old
// desktop-only method and the new mobile-first transition method,
// and report the diff per site. Does NOT write anything to data/.
// Run with `npm run verify`.
//
// Use this whenever you suspect scan drift — e.g. a site's count
// changed between two consecutive scheduled scans and you want to
// see whether it's a viewport-transition issue or a real site change.

import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sites = JSON.parse(await readFile(join(__dirname, "..", "scan", "sites.json"), "utf-8"));

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

// Must match the tag set in scan/run.mjs so this drift-check tool
// compares apples to apples against the production pipeline.
const TAGS = [
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

const browser = await chromium.launch({ headless: true });

async function gotoForgiving(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  } catch (e) {
    if (e.name === "TimeoutError") {
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    } else {
      throw e;
    }
  }
}

async function scrollThrough(page) {
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
}

async function runAxe(page) {
  return new AxeBuilder({ page }).withTags(TAGS).setLegacyMode(true).analyze();
}

// OLD method: desktop viewport only, no transition.
async function scanDesktopOnly(site) {
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  try {
    await gotoForgiving(page, site.url);
    await scrollThrough(page);
    return await runAxe(page);
  } finally {
    await ctx.close();
  }
}

// NEW method: mobile first, then resize to desktop before scan.
async function scanMobileFirst(site) {
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 375, height: 800 },
  });
  const page = await ctx.newPage();
  try {
    await gotoForgiving(page, site.url);
    await page.waitForTimeout(1500);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await page.waitForTimeout(1500);
    await scrollThrough(page);
    return await runAxe(page);
  } finally {
    await ctx.close();
  }
}

function summarise(results) {
  const total = results.violations.reduce((a, v) => a + v.nodes.length, 0);
  const rules = results.violations.map((v) => `${v.id}×${v.nodes.length}`).join(" ");
  return { total, rules };
}

console.log(`Scanning ${sites.length} sites (desktop-only vs mobile-first)...\n`);
for (const site of sites) {
  try {
    const oldRes = await scanDesktopOnly(site);
    const newRes = await scanMobileFirst(site);
    const oldS = summarise(oldRes);
    const newS = summarise(newRes);
    const delta = newS.total - oldS.total;
    const mark = delta === 0 ? "=" : delta < 0 ? "▼" : "▲";
    console.log(
      `  [${site.slug.padEnd(10)}] desktop=${String(oldS.total).padStart(3)}  mobile-first=${String(newS.total).padStart(3)}  ${mark} ${Math.abs(delta)}`,
    );
    if (delta !== 0) {
      console.log(`      desktop rules:      ${oldS.rules || "(none)"}`);
      console.log(`      mobile-first rules: ${newS.rules || "(none)"}`);
    }
  } catch (err) {
    console.log(`  [${site.slug}] ERROR: ${err.message}`);
  }
}

await browser.close();
