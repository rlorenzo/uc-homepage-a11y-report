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
  syncChartDataTable,
} from "./chart-base.js";

// Distinguish series by marker shape and dash pattern, not color alone, so
// the lines stay separable for color-blind readers and in the point-style
// legend. Keyed by the stable slug/campus index, so a series keeps its
// marker across filter changes the same way it keeps its color.
const POINT_STYLES = [
  "circle",
  "rect",
  "triangle",
  "rectRot",
  "star",
  "cross",
  "crossRot",
  "rectRounded",
];
const DASH_PATTERNS = [[], [7, 4], [2, 3], [10, 4, 2, 4]];
const seriesStyle = (index) => ({
  pointStyle: POINT_STYLES[index % POINT_STYLES.length],
  borderDash: DASH_PATTERNS[index % DASH_PATTERNS.length],
});

// Caller passes a slug-stable index (its position in the global slug
// universe, not the filtered dataset) so each site keeps the same color
// regardless of filter state. Beyond the base palette, fall back to a
// hash-derived hue. Returns both the solid border color and an
// alpha-safe fill — the hex-plus-"22" trick only works on hex literals,
// so the HSL branch has to use hsla() explicitly.
function stableColorPair(slug, index) {
  if (index < CHART_COLORS.length) {
    const hex = CHART_COLORS[index];
    return { border: hex, background: `${hex}22` };
  }
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return {
    border: `hsl(${hue}, 55%, 35%)`,
    background: `hsla(${hue}, 55%, 35%, 0.13)`,
  };
}

function isPerSiteView(state) {
  if (state.category || state.campuses.size === 1) return true;
  return state.type === TYPE_HOMEPAGES || state.type === TYPE_ADMISSIONS;
}

// Mode picker enforces the invariant: no chart mode ever produces more
// than ~18 lines, so the chart stays legible at every filter combination.
const trendMode = (state) => (isPerSiteView(state) ? "per-site" : "per-campus");

function buildPerSiteDatasets(rowFor, months, rows, globalSlugIndex) {
  const bySlug = new Map();
  for (const row of rows) bySlug.set(row.site, row);
  return [...bySlug.keys()].sort().map((slug) => {
    const idx = globalSlugIndex.get(slug) ?? 0;
    const { border, background } = stableColorPair(slug, idx);
    const style = seriesStyle(idx);
    return {
      label: siteDisplayName(bySlug.get(slug)),
      data: months.map((m) => {
        const r = rowFor(m, slug);
        return r && r.status === "ok" ? r.violations_total : null;
      }),
      borderColor: border,
      backgroundColor: background,
      borderWidth: 2,
      borderDash: style.borderDash,
      pointStyle: style.pointStyle,
      tension: 0.35,
      spanGaps: true,
      pointRadius: 3,
      pointHoverRadius: 6,
    };
  });
}

// Sum one campus's required violations for a month, or null when no site in
// the group reported a successful scan that month (so the line spans gaps
// rather than dropping to a misleading zero).
function campusMonthTotal(rowFor, month, campusSlugs) {
  const oks = campusSlugs.map((slug) => rowFor(month, slug)).filter((r) => r && r.status === "ok");
  return oks.length ? oks.reduce((sum, r) => sum + r.violations_total, 0) : null;
}

function buildPerCampusDatasets(rowFor, months, rows) {
  const slugsByCampus = new Map();
  for (const row of rows) {
    const c = row.campus || row.site;
    if (!slugsByCampus.has(c)) slugsByCampus.set(c, []);
    slugsByCampus.get(c).push(row.site);
  }
  return orderedCampuses(slugsByCampus.keys()).map((campus, i) => {
    const style = seriesStyle(i);
    return {
      label: CAMPUS_NAMES[campus] || campus,
      data: months.map((m) => campusMonthTotal(rowFor, m, slugsByCampus.get(campus))),
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}22`,
      borderWidth: 2,
      borderDash: style.borderDash,
      pointStyle: style.pointStyle,
      tension: 0.35,
      spanGaps: true,
      pointRadius: 3,
      pointHoverRadius: 6,
    };
  });
}

function buildDatasets(rowFor, months, rows, mode, globalSlugIndex) {
  return mode === "per-site"
    ? buildPerSiteDatasets(rowFor, months, rows, globalSlugIndex)
    : buildPerCampusDatasets(rowFor, months, rows);
}

// Mirror the chart into a visually-hidden data table every paint, so a
// screen reader gets the same per-series numbers the lines convey.
function syncTrendTable(canvas, datasets, months, mode) {
  syncChartDataTable(canvas.parentElement, {
    id: "trend-chart-data",
    caption: datasets.length
      ? `Required accessibility violations over time, ${mode === "per-site" ? "per site" : "per campus"}, for the current filter.`
      : "No data for the current filter.",
    headers: ["Series", ...months.map(prettyMonth)],
    rows: datasets.map((d) => [d.label, ...d.data.map((v) => (v == null ? "no data" : String(v)))]),
  });
  canvas.setAttribute("aria-describedby", "trend-chart-data");
}

export function renderTrendChart(ctx) {
  const { rowFor, months, currentRows } = ctx;

  if (typeof Chart === "undefined") {
    showChartFallback("trend-chart", "Chart could not be rendered (Chart.js failed to load).");
    return;
  }

  const canvas = document.getElementById("trend-chart");
  let chart;

  // Stable slug → palette index across all renders. Sorted over the
  // full universe so a site keeps the same color regardless of which
  // filter subset is currently active.
  const globalSlugs = [...new Set(currentRows.map((r) => r.site))].sort();
  const globalSlugIndex = new Map(globalSlugs.map((s, i) => [s, i]));

  // Point-style legend reinforces the per-series marker shapes, so the
  // legend is readable without relying on color.
  const legend = { ...SHARED_LEGEND, labels: { ...SHARED_LEGEND.labels, usePointStyle: true } };

  function paint(state) {
    const mode = trendMode(state);
    const datasets = buildDatasets(
      rowFor,
      months,
      applyFilter(currentRows, state),
      mode,
      globalSlugIndex,
    );
    syncTrendTable(canvas, datasets, months, mode);

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
          plugins: { legend, tooltip: SHARED_TOOLTIP },
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
