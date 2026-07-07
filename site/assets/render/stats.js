import { ruleFriendly } from "../data/constants.js";
import { computeAggregates } from "../data/derive.js";
import { applyFilter, describeFilter, getFilterState, subscribe } from "../state/filters.js";
import { countUp, deltaEl, prettyMonth } from "../utils/format.js";

function statLabelEl(label, badge) {
  const labelEl = document.createElement("div");
  labelEl.className = "stat-label";
  if (badge) {
    const b = document.createElement("span");
    b.className = "num";
    b.textContent = badge;
    labelEl.appendChild(b);
  }
  labelEl.appendChild(document.createTextNode(label));
  return labelEl;
}

function setStatNumber(numNode, value, animate) {
  if (typeof value !== "number") {
    numNode.textContent = value;
    return;
  }
  if (animate) {
    // Wrap the animated number in its own inner span (the caller's numNode)
    // so countUp's textContent assignments leave the sibling unit intact.
    numNode.textContent = "0";
    requestAnimationFrame(() => countUp(numNode, value));
    return;
  }
  numNode.textContent = String(value);
}

function statValueEl(value, unit, klass, animate) {
  const valueEl = document.createElement("span");
  valueEl.className =
    klass === "stat-third" || klass === "stat-half" ? "stat-value small" : "stat-value";
  const numNode = document.createElement("span");
  numNode.className = "stat-num";
  valueEl.appendChild(numNode);
  setStatNumber(numNode, value, animate);
  if (unit) {
    const u = document.createElement("span");
    u.className = "stat-unit";
    u.textContent = unit;
    valueEl.appendChild(u);
  }
  return valueEl;
}

function statCaptionEl(caption) {
  const cap = document.createElement("p");
  cap.className = "stat-caption";
  if (typeof caption === "string") cap.textContent = caption;
  else cap.appendChild(caption);
  return cap;
}

function statDeltaEl(delta) {
  const d = document.createElement("div");
  d.className = "stat-delta";
  d.appendChild(document.createTextNode("vs. last month "));
  d.appendChild(delta);
  return d;
}

// Reveal class cycles 1-7 off the current child count so a fresh grid
// staggers its entrance; only on the animated first paint.
function statCardClass(statGrid, klass, animate) {
  const reveal = animate ? ` reveal reveal-${(statGrid.children.length % 7) + 1}` : "";
  return `stat ${klass || ""}${reveal}`;
}

function makeStatCard(statGrid, { label, badge, value, unit, caption, delta, klass, animate }) {
  const card = document.createElement("div");
  card.className = statCardClass(statGrid, klass, animate);
  card.setAttribute("role", "listitem");
  card.appendChild(statLabelEl(label, badge));
  card.appendChild(statValueEl(value, unit, klass, animate));
  if (caption) card.appendChild(statCaptionEl(caption));
  if (delta) card.appendChild(statDeltaEl(delta));
  return card;
}

function totalCaptionEl({ totalErrors, okRows, filteredCurrent, scopeSuffix }) {
  const caption = document.createElement("span");
  if (totalErrors === null) {
    caption.textContent = "No successful scans in the current filter.";
    return caption;
  }
  if (totalErrors === 0) {
    caption.textContent = `No axe-core violations across ${okRows.length} of ${filteredCurrent.length} matching UC sites this month${scopeSuffix}. A strong start; keep going with manual testing.`;
    return caption;
  }
  caption.appendChild(document.createTextNode("Flagged by axe-core across "));
  const strong = document.createElement("strong");
  strong.textContent = `${okRows.length} of ${filteredCurrent.length} UC sites${scopeSuffix}`;
  caption.appendChild(strong);
  caption.appendChild(
    document.createTextNode(
      ". Each one is an opportunity to make the UC web more accessible for someone.",
    ),
  );
  return caption;
}

function buildTotalCard(statGrid, view) {
  const { totalErrors, prevTotalErrors, mobileViolationsTotal, prev, animate } = view;
  const card = makeStatCard(statGrid, {
    badge: "01",
    label: "Issues flagged",
    value: totalErrors !== null ? totalErrors : "n/a",
    caption: totalCaptionEl(view),
    delta: prev ? deltaEl(totalErrors, prevTotalErrors) : null,
    klass: "stat-big",
    animate,
  });
  if (mobileViolationsTotal > 0) {
    const footnote = document.createElement("p");
    footnote.className = "stat-mobile-footnote";
    // "in view" not "across all sites" — the total is computed from the
    // filtered rows, so the copy must scope itself the same way.
    footnote.textContent = `${mobileViolationsTotal.toLocaleString()} mobile issues across the sites in view`;
    card.appendChild(footnote);
  }
  return card;
}

function cleanCaptionEl({ cleanRows, okRows }) {
  const caption = document.createElement("span");
  if (cleanRows.length) {
    caption.appendChild(
      document.createTextNode("A clean axe-core scan is a great floor, not the ceiling. "),
    );
    caption.appendChild(document.createTextNode("Automated tools still miss "));
    const strong = document.createElement("strong");
    strong.textContent = "60 to 70 percent";
    caption.appendChild(strong);
    caption.appendChild(document.createTextNode(" of real barriers."));
    return caption;
  }
  caption.textContent = okRows.length
    ? "Every matching UC site had at least one flag this month. The top rule below is a good place to start."
    : "No clean scans in the current filter.";
  return caption;
}

function buildCleanCard(statGrid, view) {
  return makeStatCard(statGrid, {
    badge: "02",
    label: "Clean scans",
    value: view.cleanRows.length,
    unit: ` of ${view.okRows.length}`,
    caption: cleanCaptionEl(view),
    klass: "stat-half",
    animate: view.animate,
  });
}

function momView({ systemTrend, prev, scopeNote }) {
  if (!systemTrend) {
    return {
      value: "–",
      caption:
        "This is the first scan on record. Once there is a second month, the trend lands here.",
    };
  }
  if (systemTrend.delta < 0) {
    return {
      value: `▼ ${Math.abs(systemTrend.delta)}`,
      caption: `Fewer issues than ${prettyMonth(prev)}${scopeNote}. Collective progress.`,
    };
  }
  if (systemTrend.delta > 0) {
    return {
      value: `▲ ${systemTrend.delta}`,
      caption: `More issues than ${prettyMonth(prev)}${scopeNote}. New content often adds new opportunities to improve.`,
    };
  }
  return { value: "0", caption: `The same total as ${prettyMonth(prev)}${scopeNote}. Steady.` };
}

function buildMomCard(statGrid, view) {
  const { value, caption } = momView(view);
  return makeStatCard(statGrid, {
    badge: "03",
    label: "Month over month",
    value,
    caption,
    klass: "stat-half",
    animate: view.animate,
  });
}

function ruleCaptionEl(displayRule, isReach) {
  const caption = document.createElement("span");
  if (!displayRule) {
    caption.textContent = "No rules were flagged in the current filter.";
    return caption;
  }
  const strong = document.createElement("strong");
  strong.textContent = ruleFriendly(displayRule[0]);
  caption.appendChild(strong);
  caption.appendChild(
    document.createTextNode(
      isReach
        ? ". No required-level rules flagged; this is the top reach-goal rule."
        : ". Fixing this pattern first tends to have the widest benefit.",
    ),
  );
  return caption;
}

function topRuleConfig(displayRule, isReach) {
  return {
    badge: "04",
    label: isReach ? "Top rule (reach)" : "Top rule flagged",
    value: displayRule ? displayRule[0] : "–",
    unit: displayRule ? ` · ${displayRule[1]} instances` : "",
    caption: ruleCaptionEl(displayRule, isReach),
    klass: "stat-third",
  };
}

function buildTopRuleCard(statGrid, view) {
  const displayRule = view.topRuleEntry || view.topReachRuleEntry;
  const isReach = !view.topRuleEntry && Boolean(view.topReachRuleEntry);
  return makeStatCard(statGrid, { ...topRuleConfig(displayRule, isReach), animate: view.animate });
}

function densityView(okRows) {
  if (!okRows.length) return { value: "n/a", caption: "No data in the current filter." };
  const avg = okRows.reduce((s, r) => s + r.error_density, 0) / okRows.length;
  if (avg === 0) {
    return {
      value: "0",
      caption: `Zero axe-core flags per element across ${okRows.length} matching sites this month.`,
    };
  }
  // Multiple rules can hit the same element, so density can exceed 1 per
  // element. Flip the phrasing above 1 so the number stays meaningful
  // instead of rounding "1 in N" down to zero.
  if (avg >= 1) {
    return {
      value: avg.toFixed(2),
      caption: `On average, axe-core flags ${avg.toFixed(2)} issues for every DOM element it inspects. Some elements get flagged by more than one rule at once.`,
    };
  }
  const oneIn = Math.round(1 / avg);
  return {
    value: `1 in ${oneIn.toLocaleString()}`,
    caption: `On average, axe-core flags one issue for every ${oneIn.toLocaleString()} DOM elements it inspects. Raw density: ${avg.toFixed(4)}.`,
  };
}

function buildDensityCard(statGrid, view) {
  const { value, caption } = densityView(view.okRows);
  return makeStatCard(statGrid, {
    badge: "05",
    label: "Issue density",
    value,
    caption,
    klass: "stat-third",
    animate: view.animate,
  });
}

function severityCaptionEl(totalImpact, topImpactKey) {
  const caption = document.createElement("span");
  if (!(totalImpact && topImpactKey && topImpactKey[1] > 0)) {
    caption.textContent = "No issues flagged in the current filter.";
    return caption;
  }
  const pct = Math.round((topImpactKey[1] / totalImpact) * 100);
  caption.appendChild(document.createTextNode("Most flags are "));
  const strong = document.createElement("strong");
  strong.textContent = topImpactKey[0];
  caption.appendChild(strong);
  caption.appendChild(
    document.createTextNode(
      ` (${pct} percent). Severity is what axe-core reports; real user impact can be different.`,
    ),
  );
  return caption;
}

function buildSeverityCard(statGrid, view) {
  const totalImpact = Object.values(view.impactTotals).reduce((a, b) => a + b, 0);
  const has = Boolean(totalImpact && view.topImpactKey);
  return makeStatCard(statGrid, {
    badge: "06",
    label: "Severity mix",
    value: has ? view.topImpactKey[0] : "–",
    unit: has ? ` · ${view.topImpactKey[1]}` : "",
    caption: severityCaptionEl(totalImpact, view.topImpactKey),
    klass: "stat-third",
    animate: view.animate,
  });
}

const CARD_BUILDERS = [
  buildTotalCard,
  buildCleanCard,
  buildMomCard,
  buildTopRuleCard,
  buildDensityCard,
  buildSeverityCard,
];

export function renderStats(ctx) {
  const { currentRows, prevRows, prev } = ctx;
  const statGrid = document.getElementById("stat-grid");

  let firstPaint = true;

  function paint(state) {
    // Filter both months so the delta compares like-for-like — "law
    // schools this month" vs "law schools last month", not "law schools
    // now" vs "everything last month".
    const filteredCurrent = applyFilter(currentRows, state);
    const okRows = filteredCurrent.filter((r) => r.status === "ok");
    const prevOkRows = applyFilter(prevRows, state).filter((r) => r.status === "ok");
    const agg = computeAggregates({ okRows, prevOkRows, prev });

    const filterDesc = describeFilter(state);
    const view = {
      ...agg,
      okRows,
      filteredCurrent,
      prev,
      scopeSuffix: filterDesc ? ` · ${filterDesc}` : "",
      scopeNote: filterDesc ? ` (${filterDesc})` : " across the system",
      animate: firstPaint,
    };

    statGrid.textContent = "";
    for (const build of CARD_BUILDERS) statGrid.appendChild(build(statGrid, view));
    firstPaint = false;
  }

  paint(getFilterState());
  subscribe(paint);
}
