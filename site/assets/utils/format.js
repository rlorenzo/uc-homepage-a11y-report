import { CAMPUS_NAMES } from "../data/constants.js";

export const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isMissing = (v) => v === null || v === undefined;

function deltaBadge(variant, text) {
  const s = document.createElement("span");
  s.className = `delta ${variant}`;
  s.textContent = text;
  return s;
}

// zeroLabel: the stat cards prefix this with "vs. last month ", where a bare
// "0" reads as "last month was zero". They pass "no change". The site table
// keeps the default — its column is headed "Change", so "0" is unambiguous
// there and the column stays narrow across 183 rows.
export function deltaEl(current, previous, zeroLabel = "0") {
  if (isMissing(current) || isMissing(previous)) return deltaBadge("neutral", "n/a");
  const diff = current - previous;
  if (diff === 0) return deltaBadge("neutral", zeroLabel);
  if (diff < 0) return deltaBadge("improved", `▼ ${Math.abs(diff)}`);
  return deltaBadge("regressed", `▲ ${diff}`);
}

export function countUp(el, target, suffix = "") {
  if (REDUCED_MOTION || typeof target !== "number" || !Number.isFinite(target)) {
    el.textContent = target + suffix;
    return;
  }
  const duration = 900;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = Math.round(target * eased) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function prettyMonth(monthStr) {
  const [y, m] = monthStr.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function siteDisplayName(row) {
  return row.name || CAMPUS_NAMES[row.site] || row.site;
}

export function displayHostname(url) {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

export function topEntries(obj, n = Number.POSITIVE_INFINITY) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
