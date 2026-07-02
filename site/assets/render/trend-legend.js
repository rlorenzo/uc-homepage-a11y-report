// Interactive HTML legend for the trend chart. Replaces the canvas-painted
// Chart.js legend so every legend entry is a real, keyboard-reachable
// <button aria-pressed>: hover or focus spotlights that series, click pins
// the spotlight. The visually-hidden data table (chart-base.js) always
// carries every series, so spotlighting is a purely visual aid.

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

// Filled marker shapes, keyed by the Chart.js pointStyle names the trend
// chart uses. Each returns an element to be styled with the series fill
// and stroke, mirroring how Chart.js paints the data points themselves.
const FILLED_MARKERS = {
  circle: (cx, cy, r) => svgEl("circle", { cx, cy, r }),
  rect: (cx, cy, r) => svgEl("rect", { x: cx - r, y: cy - r, width: r * 2, height: r * 2 }),
  rectRounded: (cx, cy, r) =>
    svgEl("rect", { x: cx - r, y: cy - r, width: r * 2, height: r * 2, rx: r * 0.5 }),
  rectRot: (cx, cy, r) =>
    svgEl("polygon", { points: `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}` }),
  triangle: (cx, cy, r) =>
    svgEl("polygon", { points: `${cx},${cy - r} ${cx + r},${cy + r} ${cx - r},${cy + r}` }),
};

// Stroke-only marker shapes, as SVG path data.
const LINE_MARKERS = {
  cross: (cx, cy, r) => `M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cy + r}`,
  crossRot: (cx, cy, r) =>
    `M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`,
  star: (cx, cy, r) => LINE_MARKERS.cross(cx, cy, r) + LINE_MARKERS.crossRot(cx, cy, r * 0.72),
};

function markerEl(item, cx, cy, r) {
  const filled = FILLED_MARKERS[item.pointStyle];
  if (filled) {
    const shape = filled(cx, cy, r);
    shape.setAttribute("fill", item.background);
    shape.setAttribute("stroke", item.border);
    shape.setAttribute("stroke-width", "1.5");
    return shape;
  }
  const line = LINE_MARKERS[item.pointStyle] || LINE_MARKERS.cross;
  return svgEl("path", {
    d: line(cx, cy, r),
    fill: "none",
    stroke: item.border,
    "stroke-width": "1.5",
    "stroke-linecap": "round",
  });
}

// A 32x16 swatch reproducing the series line (color + dash pattern) with
// its point marker, so the legend stays readable without relying on color
// alone — the same reason the chart varies marker shape and dash.
function swatchEl(item) {
  const svg = svgEl("svg", {
    class: "legend-swatch",
    width: "32",
    height: "16",
    viewBox: "0 0 32 16",
    "aria-hidden": "true",
    focusable: "false",
  });
  const line = svgEl("path", {
    d: "M1 8H31",
    fill: "none",
    stroke: item.border,
    "stroke-width": "2",
  });
  if (item.dash?.length) line.setAttribute("stroke-dasharray", item.dash.join(" "));
  svg.append(line, markerEl(item, 16, 8, 4.5));
  return svg;
}

function checkEl() {
  const svg = svgEl("svg", {
    class: "legend-check",
    width: "14",
    height: "14",
    viewBox: "0 0 14 14",
    "aria-hidden": "true",
    focusable: "false",
  });
  svg.append(
    svgEl("path", {
      d: "M2.5 7.5L5.5 10.5L11.5 3.5",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
  return svg;
}

function legendButton(item) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "legend-item";
  btn.dataset.label = item.label;
  btn.setAttribute("aria-pressed", "false");
  const label = document.createElement("span");
  label.textContent = item.label;
  btn.append(swatchEl(item), label, checkEl());
  return btn;
}

// mouseover/mouseout (and focusin/focusout) fire when moving between an
// item's own children too; only report crossings of the item boundary.
function crossesItemBoundary(event) {
  const btn = event.target.closest(".legend-item");
  return btn && !btn.contains(event.relatedTarget) ? btn : null;
}

function bindSpotlightEvents(list, handlers, focusGuard) {
  list.addEventListener("click", (event) => {
    const btn = event.target.closest(".legend-item");
    if (btn) handlers.onToggle(btn.dataset.label);
  });
  list.addEventListener("mouseover", (event) => {
    const btn = crossesItemBoundary(event);
    if (btn) handlers.onHover(btn.dataset.label);
  });
  list.addEventListener("focusin", (event) => {
    if (focusGuard.suppress) return;
    const btn = crossesItemBoundary(event);
    if (btn) handlers.onHover(btn.dataset.label);
  });
  for (const type of ["mouseout", "focusout"]) {
    list.addEventListener(type, (event) => {
      if (crossesItemBoundary(event)) handlers.onLeave();
    });
  }
}

/**
 * Mount the legend inside `host` (the .chart-wrap) and return its
 * controller. `handlers` receives onHover(label), onLeave(), onToggle(label)
 * and onReset(); the caller owns the emphasis state and calls back into
 * update()/syncPressed() to reflect it.
 */
export function createTrendLegend(host, handlers) {
  const wrap = document.createElement("div");
  wrap.className = "chart-legend";
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", "Chart legend: spotlight lines on the errors-over-time chart");

  const list = document.createElement("div");
  list.className = "legend-items";
  // Set while focus is moved programmatically, so the handoff below
  // doesn't focus-spotlight a line the user just asked to release.
  const focusGuard = { suppress: false };
  bindSpotlightEvents(list, handlers, focusGuard);

  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "legend-reset is-hidden";
  reset.textContent = "Show all lines";
  reset.addEventListener("click", () => {
    handlers.onReset();
    // Hiding steals focus from keyboard users mid-flow; hand it to the
    // first legend entry so Tab order continues from the legend.
    if (reset.classList.contains("is-hidden")) {
      focusGuard.suppress = true;
      list.querySelector(".legend-item")?.focus();
      focusGuard.suppress = false;
    }
  });

  wrap.append(list, reset);
  host.appendChild(wrap);

  // Reflect pinned state onto the existing buttons without rebuilding
  // them, so a click never destroys the button that holds focus.
  function syncPressed(pinned) {
    for (const btn of list.querySelectorAll(".legend-item")) {
      btn.setAttribute("aria-pressed", String(pinned.has(btn.dataset.label)));
    }
    // visibility (not display) keeps the reset's space reserved, so
    // pinning never reflows the legend and resizes the chart above it.
    reset.classList.toggle("is-hidden", pinned.size === 0);
  }

  return {
    update(items, pinned) {
      list.replaceChildren(...items.map(legendButton));
      syncPressed(pinned);
    },
    syncPressed,
  };
}
