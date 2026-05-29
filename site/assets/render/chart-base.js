import { REDUCED_MOTION } from "../utils/format.js";

export function configureChartDefaults() {
  if (typeof Chart === "undefined") return;
  Chart.defaults.font.family = '"Source Sans 3", "Helvetica Neue", Arial, sans-serif';
  Chart.defaults.font.size = 13;
  Chart.defaults.color = "#3A4A5C";
  Chart.defaults.borderColor = "#E5DFD2";
}

export function showChartFallback(canvasId, message) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const p = document.createElement("p");
  p.className = "chart-fallback";
  p.textContent = message;
  wrap.replaceChild(p, canvas);
  // CSS class hook — collapses the wrapper's fixed height to its
  // natural size when a chart is replaced with fallback text.
  wrap.classList.add("chart-wrap--fallback");
}

const TOOLTIP_TITLE_FONT = {
  family: '"Source Serif 4", Georgia, serif',
  size: 14,
  weight: "500",
};

export const SHARED_LEGEND = {
  position: "bottom",
  labels: { padding: 14, boxWidth: 14, boxHeight: 14 },
};

export const SHARED_TOOLTIP = {
  backgroundColor: "#002033",
  titleColor: "#FAF7F0",
  bodyColor: "#FAF7F0",
  padding: 12,
  cornerRadius: 6,
  titleFont: TOOLTIP_TITLE_FONT,
};

export const CHART_GRID_COLOR = "#EFE9D9";

export const sharedAnimation = () => (REDUCED_MOTION ? false : { duration: 700 });

function cell(tag, scope, text) {
  const node = document.createElement(tag);
  if (scope) node.scope = scope;
  node.textContent = text;
  return node;
}

function headerRow(headers) {
  const tr = document.createElement("tr");
  for (const h of headers) tr.appendChild(cell("th", "col", h));
  return tr;
}

// First cell is the row's header; the rest are data cells.
function bodyRow(cells) {
  const tr = document.createElement("tr");
  tr.appendChild(cell("th", "row", cells[0]));
  for (const value of cells.slice(1)) tr.appendChild(cell("td", null, value));
  return tr;
}

// Build or refresh a visually-hidden data table mirroring a chart, so
// screen-reader users get the same data the canvas conveys visually. The
// table is created once per host (keyed by id) and rewritten on each paint.
// Returns the table id so the canvas can point at it via aria-describedby.
export function syncChartDataTable(host, { id, caption, headers, rows }) {
  let table = host.querySelector(`#${id}`);
  if (!table) {
    table = document.createElement("table");
    table.id = id;
    table.className = "visually-hidden";
    table.append(
      document.createElement("caption"),
      document.createElement("thead"),
      document.createElement("tbody"),
    );
    host.appendChild(table);
  }
  table.querySelector("caption").textContent = caption;
  table.querySelector("thead").replaceChildren(headerRow(headers));
  table.querySelector("tbody").replaceChildren(...rows.map(bodyRow));
  return id;
}
