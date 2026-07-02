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
  SHARED_TOOLTIP,
  showChartFallback,
  syncChartDataTable,
} from "./chart-base.js";
import { createTrendLegend } from "./trend-legend.js";

// Distinguish series by marker shape and dash pattern, not color alone, so
// the lines stay separable for color-blind readers and in the legend.
// Keyed by position within the current view, matching the color
// assignment below.
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

// Colors are assigned by position within the current view, so every
// visible chart draws from the hand-picked palette first and its lines
// stay maximally distinct. (This deliberately trades away cross-filter
// color stability — an earlier slug-hash scheme kept a site's hue
// constant between views but let two visible lines land on
// near-identical hues, which defeated the chart.) Past the palette,
// golden-angle spacing keeps overflow hues well separated. The
// hex-plus-"22" alpha trick only works on hex literals, so the HSL
// branch uses hsla() explicitly.
function seriesColorPair(index) {
  if (index < CHART_COLORS.length) {
    const hex = CHART_COLORS[index];
    return { border: hex, background: `${hex}22` };
  }
  const hue = Math.round((index * 137.508) % 360);
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

function buildPerSiteDatasets(rowFor, months, rows) {
  const bySlug = new Map();
  for (const row of rows) bySlug.set(row.site, row);
  return [...bySlug.keys()].sort().map((slug, idx) => {
    const { border, background } = seriesColorPair(idx);
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
    const { border, background } = seriesColorPair(i);
    const style = seriesStyle(i);
    return {
      label: CAMPUS_NAMES[campus] || campus,
      data: months.map((m) => campusMonthTotal(rowFor, m, slugsByCampus.get(campus))),
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

function buildDatasets(rowFor, months, rows, mode) {
  return mode === "per-site"
    ? buildPerSiteDatasets(rowFor, months, rows)
    : buildPerCampusDatasets(rowFor, months, rows);
}

// Spotlighting fades the other series to faint ghosts rather than hiding
// them, so the system-wide shape stays visible for context. Base colors
// are 6-digit hex (CHART_COLORS) or hsl() (the per-site fallback), and
// each needs its own alpha syntax.
const mutedColor = (color) =>
  color.startsWith("#") ? `${color}26` : color.replace("hsl(", "hsla(").replace(")", ", 0.15)");

const toLegendItem = (d) => ({
  label: d.label,
  border: d.baseBorder,
  background: d.baseBackground,
  dash: d.borderDash,
  pointStyle: d.pointStyle,
});

// Remember each dataset's built colors so emphasis can always restore them.
function stampBaseColors(datasets) {
  for (const d of datasets) {
    d.baseBorder = d.borderColor;
    d.baseBackground = d.backgroundColor;
  }
}

// Colors and weight for one dataset under the current spotlight set:
// spotlit series draw heavier, the rest fade to ghosts, and with no
// spotlight at all every series sits at its base style.
function emphasisStyle(d, active) {
  if (!active || active.has(d.label)) {
    return {
      borderColor: d.baseBorder,
      backgroundColor: d.baseBackground,
      borderWidth: active ? 3 : 2,
    };
  }
  const muted = mutedColor(d.baseBorder);
  return { borderColor: muted, backgroundColor: muted, borderWidth: 2 };
}

// Chart shell. The interactive HTML legend (trend-legend.js) replaces the
// canvas-painted one, so the built-in legend stays off.
const trendConfig = (months, datasets) => ({
  type: "line",
  data: { labels: months.map(prettyMonth), datasets },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: sharedAnimation(),
    plugins: { legend: { display: false }, tooltip: SHARED_TOOLTIP },
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

  // Legend spotlight state: hovering or focusing a legend entry previews
  // that series; clicking pins it (several can be pinned side by side).
  // Purely visual — the hidden data table always carries every series.
  const pinned = new Set();
  let hovered = null;

  function spotlightSet() {
    const active = new Set(pinned);
    if (hovered) active.add(hovered);
    return active.size ? active : null;
  }

  function applyEmphasis(datasets) {
    const active = spotlightSet();
    for (const d of datasets) Object.assign(d, emphasisStyle(d, active));
  }

  function repaintEmphasis() {
    if (!chart) return;
    // Chart.js caches resolved element options per dataset object, so
    // mutating colors in place leaves the point markers stale. Shallow
    // clones bust that cache; the data arrays are shared by reference.
    const datasets = chart.data.datasets.map((d) => ({ ...d }));
    applyEmphasis(datasets);
    chart.data.datasets = datasets;
    chart.update("none");
  }

  // The legend mounts on the outer panel, below the fixed-height canvas
  // box, so its row count never squeezes the plot.
  const legendUI = createTrendLegend(canvas.closest(".chart-wrap"), {
    onHover(label) {
      if (hovered === label) return;
      hovered = label;
      repaintEmphasis();
    },
    onLeave() {
      if (hovered === null) return;
      hovered = null;
      repaintEmphasis();
    },
    onToggle(label) {
      if (!pinned.delete(label)) pinned.add(label);
      legendUI.syncPressed(pinned);
      repaintEmphasis();
    },
    onReset() {
      pinned.clear();
      legendUI.syncPressed(pinned);
      repaintEmphasis();
    },
  });

  // Drop spotlight entries whose series left the chart (filter change,
  // per-campus ↔ per-site mode switch).
  function pruneSpotlight(datasets) {
    const labels = new Set(datasets.map((d) => d.label));
    const kept = [...pinned].filter((label) => labels.has(label));
    pinned.clear();
    for (const label of kept) pinned.add(label);
    // labels.has(null) is false, so a cleared hover stays cleared.
    hovered = labels.has(hovered) ? hovered : null;
  }

  // Push a dataset list into the chart without the enter/exit animation,
  // so filter changes feel instant rather than re-animating every tick.
  function setChartDatasets(datasets) {
    chart.data.datasets = datasets;
    chart.update("none");
  }

  function paint(state) {
    const mode = trendMode(state);
    const datasets = buildDatasets(rowFor, months, applyFilter(currentRows, state), mode);
    stampBaseColors(datasets);
    pruneSpotlight(datasets);
    applyEmphasis(datasets);
    syncTrendTable(canvas, datasets, months, mode);
    legendUI.update(datasets.map(toLegendItem), pinned);

    if (!chart) {
      if (datasets.length) chart = new Chart(canvas, trendConfig(months, datasets));
      return;
    }
    setChartDatasets(datasets);
  }

  paint(getFilterState());
  subscribe(paint);
}
