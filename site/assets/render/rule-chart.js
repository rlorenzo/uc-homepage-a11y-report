import { IMPACT_KEYS, ruleFriendly } from "../data/constants.js";
import { computeAggregates } from "../data/derive.js";
import { applyFilter, getFilterState, subscribe } from "../state/filters.js";
import { topEntries } from "../utils/format.js";
import {
  CHART_GRID_COLOR,
  sharedAnimation,
  SHARED_LEGEND,
  SHARED_TOOLTIP,
  showChartFallback,
} from "./chart-base.js";

// Mirrors the impact-mix legend elsewhere in the report (CSS vars
// --impact-*). Edit both together if the palette changes.
const IMPACT_COLORS = {
  critical: "#8e0c0c",
  serious: "#7a2a0a",
  moderate: "#54430b",
  minor: "#1f4426",
  unknown: "#4c4c4c",
};

export function renderRuleChart(ctx) {
  const { currentRows, prevRows, prev } = ctx;

  if (typeof Chart === "undefined") {
    showChartFallback("rule-chart", "Chart could not be rendered (Chart.js failed to load).");
    return;
  }

  const canvas = document.getElementById("rule-chart");
  // Toggleable "no matching rules" placeholder. Kept as a sibling of
  // the canvas so filter widening can restore the chart without any
  // DOM surgery — showChartFallback() is one-way and would strand us.
  const emptyState = document.createElement("p");
  emptyState.className = "chart-fallback";
  emptyState.hidden = true;
  canvas.parentElement.appendChild(emptyState);
  let chart;

  function paint(state) {
    const okRows = applyFilter(currentRows, state).filter((r) => r.status === "ok");
    const prevOkRows = applyFilter(prevRows, state).filter((r) => r.status === "ok");

    const { currentRuleTotals, currentRuleImpact } = computeAggregates({
      okRows,
      prevOkRows,
      prev,
    });
    const top10 = topEntries(currentRuleTotals, 10);

    if (!top10.length) {
      canvas.hidden = true;
      emptyState.hidden = false;
      emptyState.textContent =
        "No required-level rules flagged in the current filter. Reach-goal rules may still appear in individual site details.";
      if (chart) {
        chart.data.labels = [];
        chart.data.datasets = [];
        chart.update("none");
      }
      return;
    }

    canvas.hidden = false;
    emptyState.hidden = true;

    const labels = top10.map((e) => e[0]);
    // One dataset per impact key so Chart.js stacks them into a single
    // bar per rule. Attribution is proportional (see derive.js): shape
    // and ordering are stable but raw numbers are rounded.
    const datasets = IMPACT_KEYS.map((impact) => ({
      label: impact.charAt(0).toUpperCase() + impact.slice(1),
      data: labels.map((rule) => Math.round(currentRuleImpact[rule]?.[impact] ?? 0)),
      backgroundColor: IMPACT_COLORS[impact],
      borderRadius: 2,
      borderSkipped: false,
    }));

    if (!chart) {
      chart = new Chart(canvas, {
        type: "bar",
        data: { labels, datasets },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          animation: sharedAnimation(),
          plugins: {
            legend: SHARED_LEGEND,
            tooltip: {
              ...SHARED_TOOLTIP,
              callbacks: {
                afterTitle: (items) => ruleFriendly(items[0].label),
                footer: () => "Impact distribution is approximated proportionally from each scan.",
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              stacked: true,
              title: { display: true, text: "Total instances", font: { weight: "600" } },
              grid: { color: CHART_GRID_COLOR },
            },
            y: { stacked: true, grid: { display: false } },
          },
        },
      });
    } else {
      chart.data.labels = labels;
      chart.data.datasets = datasets;
      chart.update("none");
    }
  }

  paint(getFilterState());
  subscribe(paint);
}
