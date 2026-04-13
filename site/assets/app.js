import { deriveAggregates } from "./data/derive.js";
import { fetchHistory } from "./data/history.js";
import { readHashIntoState } from "./state/filters.js";
import { configureChartDefaults } from "./render/chart-base.js";
import { renderFilterBar } from "./render/filter-bar.js";
import { renderMasthead } from "./render/masthead.js";
import { renderRuleChart } from "./render/rule-chart.js";
import { renderSpotlight } from "./render/spotlight.js";
import { renderStats } from "./render/stats.js";
import { renderTable } from "./render/table.js";
import { renderTrendChart } from "./render/trend-chart.js";

let ctx;
try {
  ctx = await fetchHistory();
} catch {
  document.getElementById("byline-date").textContent =
    "Could not load data/history.json. Run a scan first.";
  throw new Error("history.json fetch failed");
}

if (ctx.empty) {
  document.getElementById("byline-date").textContent =
    "No scan data yet. Run a scan to populate the report.";
} else {
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
}
