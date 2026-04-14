import { deriveAggregates } from "./data/derive.js";
import { fetchHistory } from "./data/history.js";
import { getSection, readHashIntoState, setSection, subscribeSection } from "./state/filters.js";
import { configureChartDefaults } from "./render/chart-base.js";
import { renderFilterBar } from "./render/filter-bar.js";
import { renderMasthead } from "./render/masthead.js";
import { renderRuleChart } from "./render/rule-chart.js";
import { renderSpotlight } from "./render/spotlight.js";
import { renderStats } from "./render/stats.js";
import { renderTable } from "./render/table.js";
import { renderTrendChart } from "./render/trend-chart.js";

// Resolve a section target element. Top-level sections (`at-a-glance`,
// `why-it-matters`, etc.) are fixed ids on the <section> elements.
// Campus group headers render twice — once as a table row
// (`group-<slug>-row`) and once as a mobile card (`group-<slug>-card`) —
// and only one is visible at each viewport, so we pick the one with a
// non-zero client rect. Unknown ids fall through to a no-op.
function resolveSectionEl(id) {
  if (!id) return null;
  const candidates = [
    document.getElementById(id),
    document.getElementById(`${id}-row`),
    document.getElementById(`${id}-card`),
  ].filter(Boolean);
  return candidates.find((el) => el.getClientRects().length > 0) || candidates[0] || null;
}

function scrollToSection(id) {
  const el = resolveSectionEl(id);
  if (!el) return;
  // requestAnimationFrame keeps the scroll out of Chart.js's
  // synchronous layout path during the initial paint.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() =>
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" }),
  );
}

// Section anchor clicks: take over from the default hash-navigation
// behavior so the current filter hash is preserved (native anchor
// behavior would wipe it) and so scrolling matches CSS scroll-behavior.
document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-section-link]");
  if (!link) return;
  event.preventDefault();
  const id = link.dataset.sectionLink;
  setSection(id);
  scrollToSection(id);
});

let ctx = null;
try {
  ctx = await fetchHistory();
} catch (err) {
  console.error("Failed to load data/history.json:", err);
  document.getElementById("byline-date").textContent =
    "Could not load data/history.json. Run a scan first.";
}

if (ctx?.empty) {
  document.getElementById("byline-date").textContent =
    "No scan data yet. Run a scan to populate the report.";
} else if (ctx) {
  // Hydrate filter state from the URL hash *before* any renderer paints
  // so deep-linked views land at their target state on first frame.
  readHashIntoState();

  deriveAggregates(ctx);
  configureChartDefaults();

  renderMasthead(ctx);
  renderFilterBar(ctx);
  renderStats(ctx);
  renderSpotlight(ctx);
  renderTable(ctx);
  renderTrendChart(ctx);
  renderRuleChart(ctx);

  // Scroll into view after the first render frame so layout has
  // settled — Chart.js sizes its canvases during their constructors.
  scrollToSection(getSection());
  // Keep scrolling on back/forward navigation so hash history
  // entries feel like real page sections, not just state updates.
  subscribeSection((id) => scrollToSection(id));
}
