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

// Mode picker enforces the invariant: no chart mode ever produces more
// than ~18 lines, so the chart stays legible at every filter combination.
function trendMode(state) {
  if (state.type === TYPE_HOMEPAGES || state.type === TYPE_ADMISSIONS) return "per-site";
  if (state.category) return "per-site";
  if (state.campuses.size === 1) return "per-site";
  return "per-campus";
}

function buildDatasets(rowFor, months, filteredCurrentRows, mode, globalSlugIndex) {
  if (mode === "per-site") {
    const bySlug = new Map();
    for (const row of filteredCurrentRows) bySlug.set(row.site, row);
    const slugs = [...bySlug.keys()].sort();
    return slugs.map((slug) => {
      const { border, background } = stableColorPair(slug, globalSlugIndex.get(slug) ?? 0);
      return {
        label: siteDisplayName(bySlug.get(slug)),
        data: months.map((m) => {
          const r = rowFor(m, slug);
          return r && r.status === "ok" ? r.violations_total : null;
        }),
        borderColor: border,
        backgroundColor: background,
        borderWidth: 2,
        tension: 0.35,
        spanGaps: true,
        pointRadius: 3,
        pointHoverRadius: 6,
      };
    });
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

  // Stable slug → palette index across all renders. Sorted over the
  // full universe so a site keeps the same color regardless of which
  // filter subset is currently active.
  const globalSlugs = [...new Set(currentRows.map((r) => r.site))].sort();
  const globalSlugIndex = new Map(globalSlugs.map((s, i) => [s, i]));

  function paint(state) {
    const filtered = applyFilter(currentRows, state);
    const datasets = buildDatasets(rowFor, months, filtered, trendMode(state), globalSlugIndex);

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
