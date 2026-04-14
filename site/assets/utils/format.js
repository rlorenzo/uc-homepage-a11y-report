import { CAMPUS_NAMES } from "../data/constants.js";

export const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function deltaEl(current, previous) {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    const s = document.createElement("span");
    s.className = "delta neutral";
    s.textContent = "n/a";
    return s;
  }
  const diff = current - previous;
  const s = document.createElement("span");
  if (diff === 0) {
    s.className = "delta neutral";
    s.textContent = "0";
  } else if (diff < 0) {
    s.className = "delta improved";
    s.textContent = `▼ ${Math.abs(diff)}`;
  } else {
    s.className = "delta regressed";
    s.textContent = `▲ ${diff}`;
  }
  return s;
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
