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
