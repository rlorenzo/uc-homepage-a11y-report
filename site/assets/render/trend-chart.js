import {
  CAMPUS_NAMES,
  CHART_COLORS,
  orderedCampuses,
  TYPE_ADMISSIONS,
  TYPE_HOMEPAGES,
} from "../data/constants.js";
import { applyFilter, getFilterState, subscribe } from "../state/filters.js";
import { prettyMonth, siteDisplayName } from "../utils/format.js";
import {
  CHART_GRID_COLOR,
  sharedAnimation,
  SHARED_LEGEND,
  SHARED_TOOLTIP,
  showChartFallback,
} from "./chart-base.js";

// Beyond the base palette, derive a stable color from the slug so each
// site keeps the same color across renders without depending on its
// position in the dataset list.
function stableColor(slug, index) {
  if (index < CHART_COLORS.length) return CHART_COLORS[index];
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(hash) % 360}, 55%, 35%)`;
}

// Mode picker enforces the invariant: no chart mode ever produces more
// than ~18 lines, so the chart stays legible at every filter combination.
function trendMode(state) {
  if (state.type === TYPE_HOMEPAGES || state.type === TYPE_ADMISSIONS) return "per-site";
  if (state.category) return "per-site";
  if (state.campuses.size === 1) return "per-site";
  return "per-campus";
}

function buildDatasets(rowFor, months, filteredCurrentRows, mode) {
  if (mode === "per-site") {
    const bySlug = new Map();
    for (const row of filteredCurrentRows) bySlug.set(row.site, row);
    const slugs = [...bySlug.keys()].sort();
    return slugs.map((slug, i) => ({
      label: siteDisplayName(bySlug.get(slug)),
      data: months.map((m) => {
        const r = rowFor(m, slug);
        return r && r.status === "ok" ? r.violations_total : null;
      }),
      borderColor: stableColor(slug, i),
      backgroundColor: `${stableColor(slug, i)}22`,
      borderWidth: 2,
      tension: 0.35,
      spanGaps: true,
      pointRadius: 3,
      pointHoverRadius: 6,
    }));
  }

  const slugsByCampus = new Map();
  for (const row of filteredCurrentRows) {
    const c = row.campus || row.site;
    if (!slugsByCampus.has(c)) slugsByCampus.set(c, []);
    slugsByCampus.get(c).push(row.site);
  }

  return orderedCampuses(slugsByCampus.keys()).map((campus, i) => {
    const campusSlugs = slugsByCampus.get(campus);
    return {
      label: CAMPUS_NAMES[campus] || campus,
      data: months.map((m) => {
        let sum = 0;
        let anyData = false;
        for (const slug of campusSlugs) {
          const r = rowFor(m, slug);
          if (r && r.status === "ok") {
            sum += r.violations_total;
            anyData = true;
          }
        }
        return anyData ? sum : null;
      }),
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}22`,
      borderWidth: 2,
      tension: 0.35,
      spanGaps: true,
      pointRadius: 3,
      pointHoverRadius: 6,
    };
  });
}

export function renderTrendChart(ctx) {
  const { rowFor, months, currentRows } = ctx;

  if (typeof Chart === "undefined") {
    showChartFallback("trend-chart", "Chart could not be rendered (Chart.js failed to load).");
    return;
  }

  const canvas = document.getElementById("trend-chart");
  let chart;

  function paint(state) {
    const filtered = applyFilter(currentRows, state);
    const datasets = buildDatasets(rowFor, months, filtered, trendMode(state));

    if (datasets.length === 0) {
      if (chart) {
        chart.data.datasets = [];
        chart.update("none");
      }
      return;
    }

    if (!chart) {
      chart = new Chart(canvas, {
        type: "line",
        data: { labels: months.map(prettyMonth), datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: sharedAnimation(),
          plugins: { legend: SHARED_LEGEND, tooltip: SHARED_TOOLTIP },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: "Required violations", font: { weight: "600" } },
              grid: { color: CHART_GRID_COLOR },
            },
            x: {
              grid: { display: false },
              title: { display: true, text: "Month", font: { weight: "600" } },
            },
          },
        },
      });
    } else {
      chart.data.datasets = datasets;
      // 'none' skips the enter/exit animation so filter changes feel
      // instant rather than re-animating every tick.
      chart.update("none");
    }
  }

  paint(getFilterState());
  subscribe(paint);
}
